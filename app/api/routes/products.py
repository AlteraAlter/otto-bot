"""Product endpoints for catalog, creation, deletion, and XLSX import."""

import asyncio
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import UTC, date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import JSONResponse
from openpyxl import load_workbook
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.arq_app import enqueue_job
from app.core.configs import settings
from app.database import SessionLocal, get_db
from app.dependencies import (
    get_afterbuy_login,
    get_product_service,
    require_role,
)
from app.mapper.normalizer import build_normalized_product
from app.models.attributes import Attribute
from app.models.categories import Category
from app.models.category_group import CategoryGroup
from app.models.product_import_tasks import ProductImportTask
from app.models.products import Product
from app.schemas.enums import Controller, RoleEnum, SortOrderEnum
from app.schemas.product import (
    Availability,
    CreateProductRequest,
)
from app.schemas.product import (
    Product as ProductPayload,
)
from app.schemas.product_creation import (
    ProductCreationErrorResponse,
    ProductImportTaskDTO,
    ProductImportTaskListResponse,
)
from app.schemas.product_query import CategoryQuery
from app.schemas.product_response import (
    AvailabilityResponse,
    ProductCreateResponse,
)
from app.schemas.product_tasks import (
    ProductFactoryCreateRequestDTO,
    ProductFactoryCreateResponseDTO,
)
from app.services.afterbuy_service import AfterbuyService
from app.services.factory_task_state_service import FactoryTaskStateService
from app.services.product_service import ProductService
from app.services.translation_service import TranslationService, normalize_translation_text

router = APIRouter(
    prefix="/v1/products",
    tags=["Products"],
)
otto_v5_router = APIRouter(
    prefix="/v5/products",
    tags=["OTTO Products v5"],
)

XLSX_COLUMN_MAP = {
    "Produktreferenz": "product_reference",
    "SKU": "sku",
    "EAN": "ean",
    "MOIN": "moin",
    "Produktkategorie": "product_category",
    "Lieferzeit": "delivery_time",
    "Preis": "price",
    "UVP": "recommended_retail_price",
    "Sale-Preis": "sale_price",
    "Sale-Start": "sale_start",
    "Sale-Ende": "sale_end",
    "Marktplatz-Status": "marketplace_status",
    "Fehler": "error_message",
    "Aktiv-Status": "active_status",
    "Link zu otto.de": "otto_url",
    "Datum der letzten Änderung": "last_changed_at",
}
REQUIRED_XLSX_COLUMNS = list(XLSX_COLUMN_MAP.keys())
MAX_TASK_ERROR_LENGTH = 280
ATTRIBUTES_LIST_PATH = Path(__file__).resolve().parents[3] / "attributes_list.txt"
MAPPER_LOG_PATH = (
    Path(__file__).resolve().parents[3] / "logs" / "product_mapper_flow.log"
)
MAPPER_LOGGER = logging.getLogger("product_mapper_flow")
if not MAPPER_LOGGER.handlers:
    MAPPER_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        _handler = logging.FileHandler(MAPPER_LOG_PATH, encoding="utf-8")
    except OSError:
        _handler = logging.NullHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    MAPPER_LOGGER.setLevel(logging.INFO)
    MAPPER_LOGGER.addHandler(_handler)
    MAPPER_LOGGER.propagate = False

PREPARED_UPLOAD_LOG_PATH = (
    Path(__file__).resolve().parents[3] / "logs" / "prepared_upload_payloads.log"
)
PREPARED_UPLOAD_LOGGER = logging.getLogger("prepared_upload_payloads")
if not PREPARED_UPLOAD_LOGGER.handlers:
    PREPARED_UPLOAD_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        _prepared_handler = logging.FileHandler(
            PREPARED_UPLOAD_LOG_PATH, encoding="utf-8"
        )
    except OSError:
        _prepared_handler = logging.NullHandler()
    _prepared_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    )
    PREPARED_UPLOAD_LOGGER.setLevel(logging.INFO)
    PREPARED_UPLOAD_LOGGER.addHandler(_prepared_handler)
    PREPARED_UPLOAD_LOGGER.propagate = False

FACTORY_PREPARE_TASKS: dict[str, dict[str, Any]] = {}
FACTORY_HEARTBEAT_INTERVAL_SEC = 5
FACTORY_STUCK_THRESHOLD_SEC = 300
FACTORY_QUEUED_STEPS = {
    "prepare_queued",
    "ai_enrichment_queued",
    "otto_create_queued",
}
FACTORY_FETCH_TIMEOUT_SEC = 120
FACTORY_MAP_TIMEOUT_SEC = 1800
FACTORY_NORMALIZE_TIMEOUT_SEC = 20
FACTORY_PRODUCT_CONCURRENCY = settings.factory_product_concurrency
FACTORY_AI_ENRICH_ITEM_TIMEOUT_SEC = settings.factory_ai_enrich_item_timeout_seconds
FACTORY_OTTO_CREATE_BATCH_SIZE = 100
FACTORY_OTTO_UPDATE_TASK_MAX_POLLS = 60
FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC = 5
FACTORY_TASK_STATE_SERVICE = FactoryTaskStateService()
PRODUCT_DEACTIVATE_CONCURRENCY = 10


def _reset_log_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text("", encoding="utf-8")
    except OSError:
        return


def _flush_logger(logger: logging.Logger) -> None:
    for handler in logger.handlers:
        try:
            handler.flush()
        except Exception:
            continue


async def _save_factory_task_state(
    process_id: str,
    task: dict[str, Any],
    *,
    created_by_user_id: int | None = None,
) -> dict[str, Any]:
    FACTORY_PREPARE_TASKS[process_id] = task
    return await FACTORY_TASK_STATE_SERVICE.save_task(
        process_id,
        task,
        created_by_user_id=created_by_user_id,
    )


async def _get_factory_task_state(process_id: str) -> dict[str, Any] | None:
    persisted = await FACTORY_TASK_STATE_SERVICE.get_task(process_id)
    if persisted is not None:
        FACTORY_PREPARE_TASKS[process_id] = persisted
        return persisted

    cached = FACTORY_PREPARE_TASKS.get(process_id)
    if cached is not None:
        return cached
    return None


async def _mark_factory_task_stale_if_needed(
    process_id: str,
    task: dict[str, Any],
) -> tuple[dict[str, Any], float | None, float | None, bool]:
    heartbeat_at_text = task.get("heartbeat_at")
    step_started_at_text = task.get("current_step_started_at")
    now = datetime.now(UTC)
    heartbeat_lag_sec: float | None = None
    step_elapsed_sec: float | None = None
    is_stuck = False

    if isinstance(heartbeat_at_text, str):
        try:
            heartbeat_lag_sec = (
                now - datetime.fromisoformat(heartbeat_at_text)
            ).total_seconds()
        except ValueError:
            heartbeat_lag_sec = None

    if isinstance(step_started_at_text, str):
        try:
            step_elapsed_sec = (
                now - datetime.fromisoformat(step_started_at_text)
            ).total_seconds()
        except ValueError:
            step_elapsed_sec = None

    if (
        task.get("status") == "IN_PROGRESS"
        and task.get("current_step") not in FACTORY_QUEUED_STEPS
        and isinstance(heartbeat_lag_sec, float)
        and heartbeat_lag_sec > FACTORY_STUCK_THRESHOLD_SEC
    ):
        is_stuck = True
        stale_message = (
            f"Процесс был остановлен или потерян на шаге '{task.get('current_step')}' "
            f"после {int(heartbeat_lag_sec)}s без heartbeat."
        )
        task["status"] = "FAILED"
        task["stuck"] = True
        task["stuck_message"] = stale_message
        task["updated_at"] = now.isoformat()
        task["finished_at"] = now.isoformat()
        issues = task.get("issues")
        task["issues"] = (
            [stale_message, *issues] if isinstance(issues, list) else [stale_message]
        )
        await _save_factory_task_state(process_id, task)
        MAPPER_LOGGER.warning(
            "step=task_stale_marked_failed process_id=%s current_step=%s heartbeat_lag_sec=%s",
            process_id,
            task.get("current_step"),
            int(heartbeat_lag_sec),
        )

    return task, heartbeat_lag_sec, step_elapsed_sec, is_stuck


def _shape_attributes_for_schema(attributes: Any) -> list[dict[str, Any]]:
    if not isinstance(attributes, list):
        return []
    shaped: list[dict[str, Any]] = []
    for item in attributes:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        if "values" in item and isinstance(item.get("values"), list):
            values = [str(v).strip() for v in item.get("values", []) if str(v).strip()]
        else:
            raw_value = item.get("value")
            if isinstance(raw_value, list):
                values = [str(v).strip() for v in raw_value if str(v).strip()]
            elif raw_value is None:
                values = []
            else:
                text = str(raw_value).strip()
                values = [text] if text else []
        if not values:
            continue
        shaped.append(
            {
                "name": name,
                "values": values,
                "additional": bool(item.get("additional", True)),
            }
        )
    return shaped


def _shape_media_assets_for_schema(assets: Any) -> list[dict[str, Any]]:
    if not isinstance(assets, list):
        return []
    shaped: list[dict[str, Any]] = []
    for item in assets:
        if not isinstance(item, dict):
            continue
        asset_type = item.get("type") or "IMAGE"
        location = item.get("location") or item.get("filename")
        if not isinstance(location, str) or not location.strip():
            continue
        shaped.append({"type": str(asset_type), "location": location.strip()})
    return shaped


def _pick_text(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _extract_specifics_text(xml_data: Any, key: str) -> str | None:
    if not isinstance(xml_data, str) or not xml_data.strip():
        return None

    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError:
        return None

    for item in root.iter():
        children = list(item)
        if len(children) < 2:
            continue
        name = (children[0].text or "").strip()
        value = (children[1].text or "").strip()
        if name == key and value:
            return value
    return None


def _ensure_product_identity(
    *,
    normalized: dict[str, Any],
    source_item: dict[str, Any],
    mapped_item: dict[str, Any] | None,
    index: int,
) -> None:
    source_ean = _pick_text(
        source_item.get("EAN"),
        source_item.get("ean"),
        _extract_specifics_text(source_item.get("CustomItemSpecifics"), "EAN"),
        _extract_specifics_text(source_item.get("CustomItemSpecifics"), "ean"),
    )
    if not source_ean:
        fallback = _pick_text(
            normalized.get("ean"),
            normalized.get("sku"),
            normalized.get("productReference"),
            (mapped_item or {}).get("EAN"),
            (mapped_item or {}).get("ean"),
            f"AUTO-EAN-{index + 1}",
        )
        source_ean = fallback

    normalized["ean"] = source_ean
    normalized["sku"] = source_ean
    normalized["productReference"] = source_ean


def _save_prepared_payloads_snapshot(
    *,
    payloads: list[ProductPayload],
    controller: Controller,
    factory_id: str,
) -> Path:
    temp_dir = Path(__file__).resolve().parents[3] / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    file_path = (
        temp_dir
        / f"processed_products_{controller.value.lower()}_{factory_id}_{stamp}.json"
    )
    serialized = [item.model_dump(mode="json", exclude_none=True) for item in payloads]
    file_path.write_text(
        json.dumps(serialized, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return file_path


def _save_final_edited_payloads_snapshot(
    *,
    payloads: list[dict[str, Any]],
    controller: Controller,
    factory_id: str,
    process_id: str,
) -> Path:
    temp_dir = Path(__file__).resolve().parents[3] / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    file_path = (
        temp_dir
        / f"processed_products_final_{controller.value.lower()}_{factory_id}_{process_id}_{stamp}.json"
    )
    file_path.write_text(
        json.dumps(payloads, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return file_path


async def _load_category_group_contexts() -> dict[str, dict[str, Any]]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(CategoryGroup)
            .options(
                selectinload(CategoryGroup.categories),
                selectinload(CategoryGroup.attributes).selectinload(
                    Attribute.allowed_values
                ),
            )
            .order_by(CategoryGroup.name.asc())
        )
        groups = result.scalars().unique().all()

        contexts: dict[str, dict[str, Any]] = {}
        for group in groups:
            categories = sorted(
                [category.name for category in group.categories if category.name],
                key=str.casefold,
            )
            categories_display = sorted(
                [
                    {
                        "name": category.name,
                        "nameRu": category.name_ru,
                        "displayName": category.name,
                    }
                    for category in group.categories
                    if category.name
                ],
                key=lambda item: str(item["name"]).casefold(),
            )
            attributes = []
            for attr in group.attributes:
                attributes.append(
                    {
                        "name": attr.name,
                        "nameRu": attr.name_ru,
                        "displayName": attr.name_ru or attr.name,
                        "description": attr.description,
                        "descriptionRu": attr.description_ru,
                        "displayDescription": attr.description_ru or attr.description,
                        "type": attr.type,
                        "multiValue": attr.multi_value,
                        "relevance": attr.relevance,
                        "unit": attr.unit,
                        "allowedValues": [
                            item.value for item in attr.allowed_values if item.value
                        ],
                        "allowedValuesDisplay": [
                            {
                                "value": item.value,
                                "valueRu": item.value_ru,
                                "displayValue": item.value,
                            }
                            for item in attr.allowed_values
                            if item.value
                        ],
                    }
                )
            contexts[group.name] = {
                "categoryGroup": group.name,
                "categoryGroupRu": group.name_ru,
                "displayCategoryGroup": group.name,
                "categories": categories,
                "categoriesDisplay": categories_display,
                "attributes": attributes,
            }

        return contexts


async def _build_factory_prepared_products(
    *,
    payload: ProductFactoryCreateRequestDTO,
    afterbuy: AfterbuyService,
    product_service: ProductService,
    mapping_progress_callback: Any | None = None,
    mapping_total_callback: Any | None = None,
    normalized_item_callback: Any | None = None,
) -> tuple[list[ProductPayload], int, int, list[str], list[dict[str, Any]]]:
    from app.mapper.product_mapper import ProductMapper

    issues: list[str] = []
    _reset_log_file(MAPPER_LOG_PATH)
    _reset_log_file(PREPARED_UPLOAD_LOG_PATH)
    MAPPER_LOGGER.info(
        "step=start_create_from_factory controller=%s factory_id=%s",
        payload.controller.value,
        payload.factory_id,
    )

    async def _run_step_with_timeout(
        *,
        step_name: str,
        timeout_sec: int,
        fn,
    ):
        MAPPER_LOGGER.info("step=%s_start timeout_sec=%s", step_name, timeout_sec)
        try:
            result = await asyncio.wait_for(fn(), timeout=timeout_sec)
            MAPPER_LOGGER.info("step=%s_done", step_name)
            return result
        except asyncio.TimeoutError as exc:
            MAPPER_LOGGER.error(
                "step=%s_timeout timeout_sec=%s", step_name, timeout_sec
            )
            raise RuntimeError(
                f"Step '{step_name}' exceeded timeout ({timeout_sec}s)"
            ) from exc

    source = await _run_step_with_timeout(
        step_name="fetch_afterbuy_products",
        timeout_sec=FACTORY_FETCH_TIMEOUT_SEC,
        fn=lambda: afterbuy.get_products_by_factory_id(
            payload.controller,
            int(payload.factory_id),
        ),
    )
    source_items = [
        item.model_dump(mode="json", exclude_none=True) for item in source.products
    ]

    try:
        await _run_step_with_timeout(
            step_name="fetch_stammartikel_descriptions",
            timeout_sec=FACTORY_FETCH_TIMEOUT_SEC,
            fn=lambda: afterbuy.enrich_items_with_stammartikel_description(
                controller=payload.controller,
                items=source_items,
            ),
        )
    except Exception as exc:
        issues.append(f"stammartikel descriptions skipped: {exc}")
        MAPPER_LOGGER.warning(
            "step=fetch_stammartikel_descriptions_failed error=%s", exc
        )

    if mapping_total_callback is not None:
        await mapping_total_callback(len(source_items))
    MAPPER_LOGGER.info("step=fetch_afterbuy_products count=%s", len(source_items))
    PREPARED_UPLOAD_LOGGER.info(
        "step=fetch_afterbuy_products result=%s",
        json.dumps(
            {"count": len(source_items), "sample": source_items[:2]}, ensure_ascii=False
        ),
    )
    _flush_logger(PREPARED_UPLOAD_LOGGER)

    category_group_contexts = await _run_step_with_timeout(
        step_name="load_local_category_group_contexts",
        timeout_sec=FACTORY_FETCH_TIMEOUT_SEC,
        fn=_load_category_group_contexts,
    )
    MAPPER_LOGGER.info(
        "step=load_local_category_group_contexts groups=%s",
        len(category_group_contexts),
    )

    normalized_results: list[ProductPayload | None] = [None] * len(source_items)
    normalize_semaphore = asyncio.Semaphore(FACTORY_PRODUCT_CONCURRENCY)

    async def _build_and_publish_normalized_one(
        index: int,
        source_item: dict[str, Any],
        mapped_item: dict[str, Any] | None,
    ) -> None:
        try:
            if isinstance(normalized_results[index], ProductPayload):
                return
            ean = source_item.get("EAN") or source_item.get("ean")
            MAPPER_LOGGER.info("step=normalize_start index=%s ean=%s", index, ean)
            async with normalize_semaphore:
                normalized = await asyncio.wait_for(
                    asyncio.to_thread(build_normalized_product, source_item),
                    timeout=FACTORY_NORMALIZE_TIMEOUT_SEC,
                )
            PREPARED_UPLOAD_LOGGER.info(
                "step=normalize_preview index=%s body=%s",
                index,
                json.dumps(normalized, ensure_ascii=False),
            )
            _flush_logger(PREPARED_UPLOAD_LOGGER)

            product_description = normalized.get("productDescription")
            if isinstance(product_description, dict):
                if isinstance(mapped_item, dict):
                    category_group = mapped_item.get("categoryGroup")
                    if category_group:
                        normalized["aiCategoryGroup"] = category_group
                product_description["category"] = ""
                normalized["aiCategory"] = ""
                product_description["description"] = None
                product_description["bulletPoints"] = []
                product_description["attributes"] = []

            _ensure_product_identity(
                normalized=normalized,
                source_item=source_item,
                mapped_item=mapped_item,
                index=index,
            )
            if isinstance(normalized.get("mediaAssets"), list):
                normalized["mediaAssets"] = _shape_media_assets_for_schema(
                    normalized["mediaAssets"]
                )

            PREPARED_UPLOAD_LOGGER.info(
                "step=final_product_body_candidate index=%s body=%s",
                index,
                json.dumps(normalized, ensure_ascii=False),
            )
            _flush_logger(PREPARED_UPLOAD_LOGGER)

            normalized_model = ProductPayload.model_validate(normalized)
            normalized_results[index] = normalized_model
            if normalized_item_callback is not None:
                await normalized_item_callback(
                    index,
                    normalized_model.model_dump(mode="json", exclude_none=True),
                )
            MAPPER_LOGGER.info(
                "step=normalize_done index=%s ean=%s sku=%s",
                index,
                ean,
                normalized.get("sku"),
            )
        except Exception as exc:
            msg = f"normalize index={index} failed: {exc}"
            issues.append(msg)
            MAPPER_LOGGER.exception("step=normalize_error message=%s", msg)
            PREPARED_UPLOAD_LOGGER.info(
                "step=normalize_error index=%s error=%s",
                index,
                json.dumps(
                    {"message": str(exc), "source_item": source_item},
                    ensure_ascii=False,
                ),
            )
            _flush_logger(PREPARED_UPLOAD_LOGGER)

    async def _publish_mapped_item(index: int, mapped_item: dict[str, Any]) -> None:
        if index >= len(source_items) or not isinstance(source_items[index], dict):
            return
        await _build_and_publish_normalized_one(index, source_items[index], mapped_item)

    mapper = ProductMapper(
        products=source_items,
        controller=payload.controller.value,
        otto_client=product_service.client,
        category_group_contexts=category_group_contexts,
    )
    mapped_result = await _run_step_with_timeout(
        step_name="map_products",
        timeout_sec=FACTORY_MAP_TIMEOUT_SEC,
        fn=lambda: mapper.payload_deploy(
            on_item_finished=mapping_progress_callback,
            on_item_mapped=_publish_mapped_item,
        ),
    )
    mapped_items = (
        mapped_result.get("items", []) if isinstance(mapped_result, dict) else []
    )
    mapped_items_by_index = (
        mapped_result.get("items_by_index", [])
        if isinstance(mapped_result, dict)
        else []
    )
    mapper_issues = (
        mapped_result.get("issues", []) if isinstance(mapped_result, dict) else []
    )
    for item in mapper_issues:
        issues.append(f"mapper index={item.get('index')}: {item.get('message')}")
    MAPPER_LOGGER.info(
        "step=mapper_payload_deploy mapped=%s mapper_issues=%s",
        len(mapped_items),
        len(mapper_issues),
    )
    PREPARED_UPLOAD_LOGGER.info(
        "step=mapper_payload_deploy result=%s",
        json.dumps(
            {
                "mapped_items": len(mapped_items),
                "issues_count": len(mapper_issues),
                "issues": mapper_issues,
                "sample": mapped_items[:2],
            },
            ensure_ascii=False,
        ),
    )
    _flush_logger(PREPARED_UPLOAD_LOGGER)

    async def _normalize_one(index: int, source_item: dict[str, Any]) -> None:
        mapped_item = (
            mapped_items_by_index[index]
            if index < len(mapped_items_by_index)
            and isinstance(mapped_items_by_index[index], dict)
            else None
        )
        if mapped_item is None and normalized_results[index] is None:
            return
        await _build_and_publish_normalized_one(index, source_item, mapped_item)

    await asyncio.gather(
        *[
            _normalize_one(index, source_item)
            for index, source_item in enumerate(source_items)
        ]
    )

    products_payload: list[ProductPayload] = [
        item for item in normalized_results if isinstance(item, ProductPayload)
    ]

    MAPPER_LOGGER.info(
        "step=payload_built payload_items=%s skipped=%s",
        len(products_payload),
        len(source_items) - len(products_payload),
    )
    PREPARED_UPLOAD_LOGGER.info(
        "step=payload_summary result=%s",
        json.dumps(
            {
                "payload_items": len(products_payload),
                "skipped_items": len(source_items) - len(products_payload),
                "issues": issues,
            },
            ensure_ascii=False,
        ),
    )
    _flush_logger(PREPARED_UPLOAD_LOGGER)
    return products_payload, len(source_items), len(mapped_items), issues, source_items


async def _run_factory_prepare_task(
    *,
    process_id: str,
    payload: ProductFactoryCreateRequestDTO,
    afterbuy: AfterbuyService,
    product_service: ProductService,
) -> None:
    started_at = datetime.now(UTC)
    task = await _get_factory_task_state(process_id) or {}
    task.update(
        {
            "status": "IN_PROGRESS",
            "started_at": started_at.isoformat(),
            "updated_at": started_at.isoformat(),
            "heartbeat_at": started_at.isoformat(),
            "heartbeat_count": 0,
            "current_step": "prepare_initializing",
            "current_step_started_at": started_at.isoformat(),
            "stuck": False,
            "stuck_message": None,
            "progress_total": 0,
            "progress_completed": 0,
            "progress_percent": 0,
        }
    )
    await _save_factory_task_state(process_id, task)

    heartbeat_stop = asyncio.Event()

    async def _heartbeat_loop() -> None:
        while not heartbeat_stop.is_set():
            now = datetime.now(UTC)
            current = FACTORY_PREPARE_TASKS.get(process_id)
            if not current:
                await asyncio.sleep(FACTORY_HEARTBEAT_INTERVAL_SEC)
                continue
            current["heartbeat_count"] = int(current.get("heartbeat_count", 0)) + 1
            current["heartbeat_at"] = now.isoformat()
            current["updated_at"] = now.isoformat()
            MAPPER_LOGGER.info(
                "Пульс есть: process_id=%s current_step=%s heartbeat_count=%s",
                process_id,
                current.get("current_step"),
                current["heartbeat_count"],
            )
            await _save_factory_task_state(process_id, current)
            await asyncio.sleep(FACTORY_HEARTBEAT_INTERVAL_SEC)

    heartbeat_task = asyncio.create_task(_heartbeat_loop())

    async def _set_step(step: str) -> None:
        now = datetime.now(UTC)
        current = await _get_factory_task_state(process_id) or {}
        current["current_step"] = step
        current["current_step_started_at"] = now.isoformat()
        current["updated_at"] = now.isoformat()
        await _save_factory_task_state(process_id, current)
        MAPPER_LOGGER.info(
            "step=task_step_change process_id=%s current_step=%s", process_id, step
        )

    progress_lock = asyncio.Lock()

    async def _track_mapping_progress() -> None:
        async with progress_lock:
            current = await _get_factory_task_state(process_id) or {}
            total = int(current.get("progress_total") or 0)
            if total <= 0:
                return
            completed = min(total, int(current.get("progress_completed") or 0) + 1)
            current["progress_completed"] = completed
            current["progress_percent"] = int(round((completed / total) * 100))
            current["updated_at"] = datetime.now(UTC).isoformat()
            await _save_factory_task_state(process_id, current)

    async def _set_mapping_total(total: int) -> None:
        async with progress_lock:
            current = await _get_factory_task_state(process_id) or {}
            current["progress_total"] = max(0, total)
            current["progress_completed"] = 0
            current["progress_percent"] = 0
            current["products"] = []
            current["partial_products_by_index"] = {}
            current["updated_at"] = datetime.now(UTC).isoformat()
            await _save_factory_task_state(process_id, current)

    async def _append_normalized_item(index: int, product: dict[str, Any]) -> None:
        async with progress_lock:
            current = await _get_factory_task_state(process_id) or {}
            by_index_raw = current.get("partial_products_by_index")
            by_index = by_index_raw if isinstance(by_index_raw, dict) else {}
            by_index[str(index)] = product
            current["partial_products_by_index"] = by_index
            current["products"] = [
                by_index[key]
                for key in sorted(by_index, key=lambda value: int(value))
                if isinstance(by_index.get(key), dict)
            ]
            current["payload_items"] = len(current["products"])
            current["updated_at"] = datetime.now(UTC).isoformat()
            await _save_factory_task_state(process_id, current)

    try:
        await _set_step("building_category_preview")
        (
            products_payload,
            source_count,
            mapped_count,
            issues,
            raw_source_items,
        ) = await _build_factory_prepared_products(
            payload=payload,
            afterbuy=afterbuy,
            product_service=product_service,
            mapping_progress_callback=_track_mapping_progress,
            mapping_total_callback=_set_mapping_total,
            normalized_item_callback=_append_normalized_item,
        )
        MAPPER_LOGGER.info(
            "Категории готовы для предпросмотра: process_id=%s source_items=%s mapped_items=%s payload_items=%s",
            process_id,
            source_count,
            mapped_count,
            len(products_payload),
        )
        current = await _get_factory_task_state(process_id) or {}
        current["progress_total"] = source_count
        current["progress_completed"] = min(
            source_count,
            int(current.get("progress_completed") or 0),
        )
        current["progress_percent"] = (
            int(round((current["progress_completed"] / source_count) * 100))
            if source_count > 0
            else 0
        )
        current["updated_at"] = datetime.now(UTC).isoformat()
        await _save_factory_task_state(process_id, current)
        await _set_step("saving_snapshot")
        snapshot_path = _save_prepared_payloads_snapshot(
            payloads=products_payload,
            controller=payload.controller,
            factory_id=payload.factory_id,
        )
        await _save_factory_task_state(
            process_id,
            {
                "status": "DONE",
                "controller": payload.controller.value,
                "factory_id": payload.factory_id,
                "source_items": source_count,
                "mapped_items": mapped_count,
                "payload_items": len(products_payload),
                "issues": issues,
                "source_items_raw": raw_source_items,
                "products": [
                    item.model_dump(mode="json", exclude_none=True)
                    for item in products_payload
                ],
                "partial_products_by_index": {},
                "snapshot_path": snapshot_path.as_posix(),
                "current_step": "category_preview_done",
                "finished_at": datetime.now(UTC).isoformat(),
                "heartbeat_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
                "progress_total": source_count,
                "progress_completed": source_count,
                "progress_percent": 100 if source_count > 0 else 0,
            },
        )
    except Exception as exc:
        MAPPER_LOGGER.exception(
            "step=factory_prepare_task_failed process_id=%s error=%s", process_id, exc
        )
        await _save_factory_task_state(
            process_id,
            {
                "status": "FAILED",
                "controller": payload.controller.value,
                "factory_id": payload.factory_id,
                "issues": [str(exc)],
                "products": [],
                "finished_at": datetime.now(UTC).isoformat(),
                "heartbeat_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )
    finally:
        heartbeat_stop.set()
        try:
            await heartbeat_task
        except Exception:
            pass


def _product_to_dict(product: Product) -> dict[str, Any]:
    """Serialize the local spreadsheet-backed product row."""
    return {
        "id": product.id,
        "productReference": product.product_reference,
        "sku": product.sku,
        "ean": product.ean,
        "moin": product.moin,
        "productCategory": product.product_category,
        "deliveryTime": product.delivery_time,
        "price": product.price,
        "recommendedRetailPrice": product.recommended_retail_price,
        "salePrice": product.sale_price,
        "saleStart": product.sale_start.isoformat() if product.sale_start else None,
        "saleEnd": product.sale_end.isoformat() if product.sale_end else None,
        "marketplaceStatus": product.marketplace_status,
        "errorMessage": product.error_message,
        "activeStatus": product.active_status,
        "ottoUrl": product.otto_url,
        "mediaAssetLinks": product.media_asset_links or [],
        "lastChangedAt": (
            product.last_changed_at.isoformat() if product.last_changed_at else None
        ),
    }


def _summarize_task_error(exc: Exception) -> str:
    """Store a short task error message instead of a full traceback/SQL dump."""
    message = str(exc).strip() or exc.__class__.__name__
    first_line = message.splitlines()[0].strip()
    compact = " ".join(first_line.split())
    if len(compact) <= MAX_TASK_ERROR_LENGTH:
        return compact
    return f"{compact[: MAX_TASK_ERROR_LENGTH - 1].rstrip()}…"


def _task_to_dto(task: ProductImportTask) -> ProductImportTaskDTO:
    return ProductImportTaskDTO(
        id=task.id,
        file_name=task.file_name,
        status=task.status,
        total_rows=task.total_rows,
        processed_rows=task.processed_rows,
        upserted_rows=task.upserted_rows,
        skipped_rows=task.skipped_rows,
        error_message=task.error_message,
        created_at=task.created_at.isoformat(),
        updated_at=task.updated_at.isoformat(),
        started_at=task.started_at.isoformat() if task.started_at else None,
        finished_at=task.finished_at.isoformat() if task.finished_at else None,
    )


def _normalize_ean_lines(raw_items: list[Any]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        text = str(item or "").strip().strip(",").strip('"').strip("'").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def _extract_process_id(create_result: ProductCreateResponse) -> str | None:
    for link in create_result.links:
        match = re.search(r"update-tasks/([^/?#]+)", link.href)
        if match:
            return match.group(1)
    match = re.search(
        r"\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b",
        create_result.message or "",
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    return None


def _chunk_list(items: list[Any], size: int) -> list[list[Any]]:
    if size <= 0:
        return [items]
    return [items[index : index + size] for index in range(0, len(items), size)]


def _read_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _compute_update_sleep_seconds(update_result: dict[str, Any]) -> int:
    ping_after_value = update_result.get("pingAfter")
    sleep_seconds = FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC
    if isinstance(ping_after_value, str):
        try:
            ping_after = datetime.fromisoformat(ping_after_value.replace("Z", "+00:00"))
            now = datetime.now(UTC)
            delta = (ping_after - now).total_seconds()
            sleep_seconds = max(
                1,
                min(
                    FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC,
                    int(delta) if delta > 0 else 1,
                ),
            )
        except ValueError:
            sleep_seconds = FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC
    return sleep_seconds


async def _poll_otto_update_task(
    *,
    product_service: ProductService,
    process_id: str,
    controller: Controller,
) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    update_result: dict[str, Any] = {}
    otto_state = ""

    for _ in range(FACTORY_OTTO_UPDATE_TASK_MAX_POLLS):
        update_result = await product_service.update_tasks(
            process_id, controller=controller
        )
        otto_state = str(update_result.get("state", "")).lower()
        if otto_state in {"done", "failed", "error"}:
            break
        await asyncio.sleep(_compute_update_sleep_seconds(update_result))

    failed_result: dict[str, Any] | None = None
    failed_count = _read_int(update_result.get("failed"))
    if failed_count > 0:
        failed_result = await product_service.failed_tasks(
            process_id, controller=controller
        )

    return update_result, failed_result, otto_state


async def _submit_products_to_otto_in_batches(
    *,
    product_service: ProductService,
    controller: Controller,
    products: list[ProductPayload],
) -> tuple[str | None, str, dict[str, Any], dict[str, Any] | None]:
    batches = _chunk_list(products, FACTORY_OTTO_CREATE_BATCH_SIZE)
    process_ids: list[str] = []
    batch_summaries: list[dict[str, Any]] = []
    aggregated_failed_results: list[Any] = []

    total = 0
    succeeded = 0
    failed = 0
    progress = 0
    final_state = "done"

    for batch_index, batch in enumerate(batches, start=1):
        MAPPER_LOGGER.info(
            "step=submit_final_products_batch_create_start batch=%s batch_size=%s",
            batch_index,
            len(batch),
        )
        create_payload = CreateProductRequest(controller=controller, products=batch)
        create_result = await product_service.create_or_update_products(create_payload)
        otto_process_id = _extract_process_id(create_result)
        create_state = str(create_result.state or "").lower()
        update_result: dict[str, Any] = {}
        failed_result: dict[str, Any] | None = None
        batch_state = create_state

        if otto_process_id:
            process_ids.append(otto_process_id)
            MAPPER_LOGGER.info(
                "step=submit_final_products_batch_poll_start batch=%s otto_process_id=%s",
                batch_index,
                otto_process_id,
            )
            update_result, failed_result, batch_state = await _poll_otto_update_task(
                product_service=product_service,
                process_id=otto_process_id,
                controller=controller,
            )
        else:
            batch_state = "failed"

        batch_total = _read_int(update_result.get("total"), len(batch))
        batch_failed = _read_int(update_result.get("failed"))
        batch_succeeded = _read_int(
            update_result.get("succeeded"),
            max(0, len(batch) - batch_failed) if batch_state == "done" else 0,
        )
        batch_progress = _read_int(
            update_result.get("progress"),
            batch_total if batch_state == "done" else batch_succeeded + batch_failed,
        )

        total += batch_total
        succeeded += batch_succeeded
        failed += batch_failed
        progress += batch_progress

        if batch_state in {"failed", "error"} or batch_failed > 0:
            final_state = "failed"

        if isinstance(failed_result, dict):
            results = failed_result.get("results")
            if isinstance(results, list):
                aggregated_failed_results.extend(results)

        batch_summaries.append(
            {
                "batch": batch_index,
                "batchSize": len(batch),
                "processId": otto_process_id,
                "state": batch_state,
                "total": batch_total,
                "succeeded": batch_succeeded,
                "failed": batch_failed,
                "progress": batch_progress,
            }
        )
        MAPPER_LOGGER.info(
            "step=submit_final_products_batch_done batch=%s process_id=%s failed=%s state=%s",
            batch_index,
            otto_process_id,
            batch_failed,
            batch_state,
        )

    aggregated_update_result = {
        "state": final_state,
        "total": total,
        "progress": min(total, progress),
        "succeeded": succeeded,
        "failed": failed,
        "batchCount": len(batch_summaries),
        "processIds": process_ids,
        "batches": batch_summaries,
    }
    aggregated_failed_result = (
        {"results": aggregated_failed_results} if aggregated_failed_results else None
    )
    aggregated_process_id = ",".join(process_ids) if process_ids else None

    return (
        aggregated_process_id,
        final_state,
        aggregated_update_result,
        aggregated_failed_result,
    )


def _empty_to_none(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return value


def _as_text(value: Any) -> str | None:
    value = _empty_to_none(value)
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _parse_float(value: Any) -> float | None:
    value = _empty_to_none(value)
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip()
        if "," in normalized and "." in normalized:
            normalized = normalized.replace(".", "").replace(",", ".")
        elif "," in normalized:
            normalized = normalized.replace(",", ".")
        try:
            return float(normalized)
        except ValueError:
            return None
    return None


def _parse_datetime(value: Any) -> datetime | None:
    value = _empty_to_none(value)
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str):
        for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def _normalize_xlsx_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "product_reference": _as_text(row.get("Produktreferenz")),
        "sku": _as_text(row.get("SKU")),
        "ean": _as_text(row.get("EAN")),
        "moin": _as_text(row.get("MOIN")),
        "product_category": _as_text(row.get("Produktkategorie")),
        "delivery_time": _as_text(row.get("Lieferzeit")),
        "price": _parse_float(row.get("Preis")),
        "recommended_retail_price": _parse_float(row.get("UVP")),
        "sale_price": _parse_float(row.get("Sale-Preis")),
        "sale_start": _parse_datetime(row.get("Sale-Start")),
        "sale_end": _parse_datetime(row.get("Sale-Ende")),
        "marketplace_status": _as_text(row.get("Marktplatz-Status")),
        "error_message": _as_text(row.get("Fehler")),
        "active_status": _as_text(row.get("Aktiv-Status")),
        "otto_url": _as_text(row.get("Link zu otto.de")),
        "last_changed_at": _parse_datetime(row.get("Datum der letzten Änderung")),
    }
    return normalized


def _read_xlsx_rows(raw: bytes) -> list[dict[str, Any]]:
    workbook = load_workbook(filename=BytesIO(raw), read_only=True, data_only=True)
    worksheet = workbook.active

    header_row_index: int | None = None
    headers: list[Any] = []
    for index, row in enumerate(
        worksheet.iter_rows(min_row=1, max_row=5, values_only=True),
        start=1,
    ):
        row_values = list(row)
        if all(column in row_values for column in REQUIRED_XLSX_COLUMNS):
            header_row_index = index
            headers = row_values
            break

    if header_row_index is None:
        raise ValueError("Could not find the expected XLSX header row")

    rows: list[dict[str, Any]] = []
    for row in worksheet.iter_rows(min_row=header_row_index + 1, values_only=True):
        row_dict = {
            str(header): value
            for header, value in zip(headers, row)
            if header is not None
        }
        if not any(_empty_to_none(value) is not None for value in row_dict.values()):
            continue
        rows.append(_normalize_xlsx_row(row_dict))

    return rows


def _deduplicate_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    rows_without_identity: list[dict[str, Any]] = []
    rows_by_identity: dict[tuple[str, str | None], dict[str, Any]] = {}

    for row in rows:
        sku = _as_text(row.get("sku"))
        ean = _as_text(row.get("ean"))
        product_reference = _as_text(row.get("product_reference"))

        identity: tuple[str, str | None] | None = None
        if sku:
            identity = ("sku", sku)
        elif ean:
            identity = ("ean", ean)
        elif product_reference:
            identity = ("product_reference", product_reference)

        if identity is None:
            rows_without_identity.append(row)
            continue

        rows_by_identity[identity] = row

    deduplicated_rows = list(rows_by_identity.values()) + rows_without_identity
    skipped_rows = len(rows) - len(deduplicated_rows)
    return deduplicated_rows, skipped_rows


async def _upsert_products_in_batches(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    batch_size: int = 100,
    progress_callback: Any | None = None,
) -> int:
    upserted_rows = 0
    for start in range(0, len(rows), batch_size):
        chunk = rows[start : start + batch_size]
        sku_values = {
            _as_text(row.get("sku")) for row in chunk if _as_text(row.get("sku"))
        }
        ean_values = {
            _as_text(row.get("ean")) for row in chunk if _as_text(row.get("ean"))
        }
        reference_values = {
            _as_text(row.get("product_reference"))
            for row in chunk
            if _as_text(row.get("product_reference"))
        }

        conditions = []
        if sku_values:
            conditions.append(Product.sku.in_(sku_values))
        if ean_values:
            conditions.append(Product.ean.in_(ean_values))
        if reference_values:
            conditions.append(Product.product_reference.in_(reference_values))

        existing_by_sku: dict[str, Product] = {}
        existing_by_ean: dict[str, Product] = {}
        existing_by_reference: dict[str, Product] = {}

        if conditions:
            existing_result = await db.execute(select(Product).where(or_(*conditions)))
            existing_products = existing_result.scalars().all()
            for product in existing_products:
                if product.sku:
                    existing_by_sku[product.sku] = product
                if product.ean:
                    existing_by_ean[product.ean] = product
                if product.product_reference:
                    existing_by_reference[product.product_reference] = product

        for row in chunk:
            sku = _as_text(row.get("sku"))
            ean = _as_text(row.get("ean"))
            product_reference = _as_text(row.get("product_reference"))

            matched_product: Product | None = None
            for candidate in (
                existing_by_sku.get(sku) if sku else None,
                existing_by_ean.get(ean) if ean else None,
                (
                    existing_by_reference.get(product_reference)
                    if product_reference
                    else None
                ),
            ):
                if candidate is not None:
                    matched_product = candidate
                    break

            if matched_product is None:
                matched_product = Product(**row)
                db.add(matched_product)
            else:
                for column in XLSX_COLUMN_MAP.values():
                    setattr(matched_product, column, row.get(column))

            await db.flush()

            if matched_product.sku:
                existing_by_sku[matched_product.sku] = matched_product
            if matched_product.ean:
                existing_by_ean[matched_product.ean] = matched_product
            if matched_product.product_reference:
                existing_by_reference[matched_product.product_reference] = (
                    matched_product
                )

        upserted_rows += len(chunk)
        if progress_callback is not None:
            await progress_callback(upserted_rows)

    await db.commit()
    return upserted_rows


async def _run_product_import_task(
    *,
    task_id: str,
    file_name: str,
    raw: bytes,
) -> None:
    async with SessionLocal() as session:
        task = await session.get(ProductImportTask, task_id)
        if task is None:
            return

        task.status = "running"
        task.started_at = datetime.utcnow()
        task.error_message = None
        await session.commit()

        try:
            parsed_rows = _read_xlsx_rows(raw)
            rows, skipped_rows = _deduplicate_rows(parsed_rows)
            task.total_rows = len(parsed_rows)
            task.skipped_rows = skipped_rows
            task.file_name = file_name
            await session.commit()

            async def update_progress(processed_rows: int) -> None:
                task.processed_rows = processed_rows
                task.upserted_rows = processed_rows
                await session.commit()
                await sleep(0)

            if rows:
                upserted_rows = await _upsert_products_in_batches(
                    session,
                    rows,
                    progress_callback=update_progress,
                )
            else:
                upserted_rows = 0

            task.status = "completed"
            task.processed_rows = len(parsed_rows)
            task.upserted_rows = upserted_rows
            task.finished_at = datetime.utcnow()
            task.error_message = None
            await session.commit()
        except Exception as exc:
            await session.rollback()
            task = await session.get(ProductImportTask, task_id)
            if task is None:
                return
            task.status = "failed"
            task.error_message = _summarize_task_error(exc)
            task.finished_at = datetime.utcnow()
            await session.commit()


def _is_all_categories_value(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip().lower()
    return normalized in {"", "all", "all categories", "all category", "allcategories"}


def _normalized_product_category_expression():
    return func.lower(func.trim(Product.product_category))


@router.get("/db")
async def get_db_products(
    db: AsyncSession = Depends(get_db),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=1000),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("id", alias="sortBy"),
    sort_order: SortOrderEnum = Query(default=SortOrderEnum.DESC, alias="sortOrder"),
):
    """Return paginated spreadsheet-imported rows from the local DB."""
    sort_columns = {
        "id": Product.id,
        "sku": Product.sku,
        "productReference": Product.product_reference,
        "category": Product.product_category,
        "ean": Product.ean,
        "moin": Product.moin,
        "price": Product.price,
        "marketplaceStatus": Product.marketplace_status,
        "lastChangedAt": Product.last_changed_at,
    }
    sort_column = sort_columns.get(sort_by, Product.id)
    sorter = asc if sort_order == SortOrderEnum.ASC else desc

    filters = []
    if sku:
        filters.append(Product.sku == sku)
    if product_reference:
        filters.append(Product.product_reference == product_reference)
    if category and not _is_all_categories_value(category):
        normalized_category = category.strip().casefold()
        if normalized_category:
            filters.append(
                _normalized_product_category_expression() == normalized_category
            )
    if search:
        if term := search.strip():
            pattern = f"%{term}%"
            filters.append(
                or_(
                    Product.sku.ilike(pattern),
                    Product.product_reference.ilike(pattern),
                    Product.ean.ilike(pattern),
                    Product.moin.ilike(pattern),
                    Product.product_category.ilike(pattern),
                    Product.marketplace_status.ilike(pattern),
                    Product.error_message.ilike(pattern),
                    Product.active_status.ilike(pattern),
                )
            )

    count_stmt = select(func.count()).select_from(Product)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = await db.scalar(count_stmt)

    stmt = (
        select(Product)
        .order_by(sorter(sort_column), sorter(Product.id))
        .offset(page * limit)
        .limit(limit)
    )
    if filters:
        stmt = stmt.where(*filters)

    result = await db.execute(stmt)
    items = result.scalars().all()

    return {
        "items": [_product_to_dict(item) for item in items],
        "page": page,
        "limit": limit,
        "total": total or 0,
    }


@router.get("/db/categories")
async def get_db_product_categories(
    db: AsyncSession = Depends(get_db),
):
    """Return OTTO subcategories from the local category cache."""
    stmt = (
        select(func.trim(Category.name))
        .where(Category.name.is_not(None))
        .distinct()
        .order_by(func.trim(Category.name).asc())
    )
    result = await db.execute(stmt)
    raw_items = result.scalars().all()

    unique_items: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        if item is None:
            continue
        normalized = item.strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique_items.append(normalized)

    unique_items.sort(key=str.casefold)
    return {
        "items": unique_items,
        "total": len(unique_items),
    }


@router.get("/db/category-groups/categories")
async def get_db_category_group_categories(
    category_group: list[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Return local OTTO subcategories only for the requested CategoryGroups."""
    requested_groups: list[str] = []
    seen_groups: set[str] = set()
    for item in category_group:
        normalized = str(item or "").strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen_groups:
            continue
        seen_groups.add(key)
        requested_groups.append(normalized)

    if not requested_groups:
        return {"items": [], "total": 0}

    stmt = (
        select(CategoryGroup)
        .options(selectinload(CategoryGroup.categories))
        .where(func.lower(CategoryGroup.name).in_([item.casefold() for item in requested_groups]))
        .order_by(CategoryGroup.name.asc())
    )
    result = await db.execute(stmt)
    groups = result.scalars().unique().all()

    items: list[dict[str, Any]] = []
    for group in groups:
        category_items = sorted(
            [
                {
                    "name": str(category.name).strip(),
                    "nameRu": str(category.name_ru).strip() if category.name_ru else None,
                    "displayName": str(category.name).strip(),
                }
                for category in group.categories
                if category.name and str(category.name).strip()
            ],
            key=lambda item: item["name"].casefold(),
        )
        categories = [item["name"] for item in category_items]
        if not categories:
            categories = [str(group.name).strip()]
            category_items = [
                {
                    "name": str(group.name).strip(),
                    "nameRu": str(group.name_ru).strip() if group.name_ru else None,
                    "displayName": str(group.name).strip(),
                }
            ]
        items.append(
            {
                "categoryGroup": group.name,
                "categoryGroupRu": group.name_ru,
                "displayCategoryGroup": group.name,
                "categories": categories,
                "categoriesDisplay": category_items,
            }
        )

    return {"items": items, "total": len(items)}


@router.get("/db/category-attributes")
async def get_db_category_attributes(
    category: str | None = Query(default=None),
    category_group: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return local OTTO attributes for a product category or CategoryGroup."""
    normalized_category = str(category or "").strip()
    normalized_group = str(category_group or "").strip()
    if not normalized_category and not normalized_group:
        return {"items": [], "total": 0, "categoryGroup": None}

    stmt = (
        select(CategoryGroup)
        .options(selectinload(CategoryGroup.attributes).selectinload(Attribute.allowed_values))
        .order_by(CategoryGroup.name.asc())
    )
    if normalized_category:
        stmt = stmt.join(Category).where(func.lower(Category.name) == normalized_category.casefold())
    else:
        stmt = stmt.where(func.lower(CategoryGroup.name) == normalized_group.casefold())

    result = await db.execute(stmt)
    group = result.scalars().unique().first()
    if group is None:
        return {"items": [], "total": 0, "categoryGroup": None}

    items = [
        {
            "name": attr.name,
            "nameRu": attr.name_ru,
            "displayName": attr.name_ru or attr.name,
            "description": attr.description,
            "descriptionRu": attr.description_ru,
            "displayDescription": attr.description_ru or attr.description,
            "type": attr.type,
            "multiValue": attr.multi_value,
            "relevance": attr.relevance,
            "unit": attr.unit,
            "allowedValues": sorted(
                {item.value for item in attr.allowed_values if item.value},
                key=str.casefold,
            ),
            "allowedValuesDisplay": sorted(
                [
                    {
                        "value": item.value,
                        "valueRu": item.value_ru,
                        "displayValue": item.value,
                    }
                    for item in attr.allowed_values
                    if item.value
                ],
                key=lambda item: str(item["displayValue"]).casefold(),
            ),
        }
        for attr in sorted(group.attributes, key=lambda item: item.name.casefold())
        if attr.name
    ]
    return {
        "items": items,
        "total": len(items),
        "categoryGroup": group.name,
        "categoryGroupRu": group.name_ru,
        "displayCategoryGroup": group.name,
    }


async def _get_otto_product_categories(
    *,
    page: int,
    limit: int,
    category: str | None,
    product_service: ProductService,
):
    payload = CategoryQuery(
        page=page,
        limit=limit,
        category=category,
    ).to_payload()
    return await product_service.get_categories(payload)


@router.get("/categories")
async def get_product_categories(
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=1, ge=0, le=2000),
    category: str | None = Query(default=None),
    product_service: ProductService = Depends(get_product_service),
):
    """Proxy OTTO `GET /v5/products/categories` through the backend API."""
    return await _get_otto_product_categories(
        page=page,
        limit=limit,
        category=category,
        product_service=product_service,
    )


@otto_v5_router.get("/categories")
async def get_otto_v5_product_categories(
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=10, le=2000),
    category: str | None = Query(default=None),
    controller: Controller = Query(default=Controller.JV),
    product_service: ProductService = Depends(get_product_service),
):
    """Proxy OTTO `GET /v5/products/categories` and expose the OTTO path in docs."""
    return await _get_otto_product_categories(
        page=page,
        limit=limit,
        category=category,
        controller=controller,
        product_service=product_service,
    )


@router.get("/otto/shipping-profiles")
async def get_shipping_profiles(
    controller: Controller = Query(default=Controller.JV),
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.get_shipping_profiles(controller=controller)


# <======= POST METHOD =======>


@router.post("/create", response_model=ProductCreateResponse)
async def create_or_update_products(
    payload: CreateProductRequest,
    product_service: ProductService = Depends(get_product_service),
):
    """Create or update products in OTTO from already validated request payloads."""
    return await product_service.create_or_update_products(payload)


@router.post("/create-availability", response_model=AvailabilityResponse)
async def create_availability(
    payload: Availability,
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.create_availability(payload)


@router.post("/deactivate-by-ean")
async def deactivate_products_by_ean(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    _current_user=Depends(require_role([RoleEnum.SEO])),
    product_service: ProductService = Depends(get_product_service),
):
    raw_eans = payload.get("eans")
    if not isinstance(raw_eans, list) or not raw_eans:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "eans must be a non-empty array"},
        )

    controller_value = str(payload.get("controller") or "jv").lower()
    try:
        controller = Controller(controller_value)
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "message": f"Invalid controller: {controller_value}",
            },
        )

    eans = _normalize_ean_lines(raw_eans)
    if not eans:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "No valid EAN values provided"},
        )

    stmt = select(Product).where(Product.ean.in_(eans))
    existing_rows = (await db.execute(stmt)).scalars().all()
    products_by_ean = {str(item.ean): item for item in existing_rows if item.ean}

    semaphore = asyncio.Semaphore(PRODUCT_DEACTIVATE_CONCURRENCY)
    results: list[dict[str, Any] | None] = [None] * len(eans)

    async def _deactivate_one(index: int, ean: str) -> None:
        product_row = products_by_ean.get(ean)
        sku = str((product_row.sku if product_row and product_row.sku else ean)).strip()
        item_result = {
            "ean": ean,
            "sku": sku,
            "quantity_success": False,
            "status_success": False,
            "success": False,
            "message": "",
        }
        try:
            async with semaphore:
                quantity_response = await product_service.update_quantity(
                    {"sku": sku, "quantity": "0"},
                    controller=controller,
                )
                await product_service.update_status(
                    {"status": [{"sku": sku, "active": False}]},
                    controller=controller,
                )
            item_result["quantity_success"] = True
            item_result["status_success"] = True
            item_result["success"] = True
            item_result["message"] = "deactivated"
            if product_row is not None:
                product_row.active_status = "false"
                product_row.marketplace_status = "INACTIVE"
                product_row.error_message = None
            _ = quantity_response
        except Exception as exc:
            item_result["message"] = str(exc)
        results[index] = item_result

    await asyncio.gather(
        *[_deactivate_one(index, ean) for index, ean in enumerate(eans)]
    )
    await db.commit()

    normalized_results = [item for item in results if isinstance(item, dict)]
    failed = [item for item in normalized_results if not item.get("success")]
    return {
        "success": len(failed) == 0,
        "controller": controller.value,
        "total": len(eans),
        "failed": len(failed),
        "items": normalized_results,
    }


@router.post(
    "/upload-xlsx-task",
    response_model=ProductImportTaskDTO,
    responses={
        400: {"model": ProductCreationErrorResponse, "description": "Invalid request"},
        415: {
            "model": ProductCreationErrorResponse,
            "description": "Unsupported media type",
        },
    },
)
async def create_xlsx_import_task(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role([RoleEnum.SEO])),
    file: UploadFile = File(..., description="XLSX file exported from OTTO market"),
):
    """Create a background XLSX import task and return its initial status."""
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        return JSONResponse(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            content=ProductCreationErrorResponse(
                message="Only .xlsx files are supported"
            ).model_dump(),
        )

    raw = await file.read()
    if not raw:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message="Uploaded file is empty"
            ).model_dump(),
        )

    task = ProductImportTask(
        id=str(uuid4()),
        file_name=file.filename,
        status="queued",
        created_by_user_id=current_user.id,
        total_rows=None,
        processed_rows=0,
        upserted_rows=0,
        skipped_rows=0,
        error_message=None,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    background_tasks.add_task(
        _run_product_import_task,
        task_id=task.id,
        file_name=file.filename,
        raw=raw,
    )
    return _task_to_dto(task)


@router.get(
    "/import-tasks",
    response_model=ProductImportTaskListResponse,
)
async def list_product_import_tasks(
    db: AsyncSession = Depends(get_db),
    _current_user=Depends(require_role([RoleEnum.SEO])),
    limit: int = Query(default=20, ge=1, le=100),
):
    stmt = (
        select(ProductImportTask)
        .order_by(ProductImportTask.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()
    return ProductImportTaskListResponse(items=[_task_to_dto(task) for task in tasks])


@router.get(
    "/import-tasks/{task_id}",
    response_model=ProductImportTaskDTO,
)
async def get_product_import_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user=Depends(require_role([RoleEnum.SEO])),
):
    task = await db.get(ProductImportTask, task_id)
    if task is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ProductCreationErrorResponse(
                message=f"Import task '{task_id}' not found"
            ).model_dump(),
        )
    return _task_to_dto(task)


@router.get("/db/{sku}")
async def get_db_product(
    sku: str,
    db: AsyncSession = Depends(get_db),
):
    """Fetch one product from the local DB by SKU (generic product lookup path)."""
    stmt = select(Product).where(Product.sku == sku)
    stmt = stmt.order_by(Product.id.desc())

    result = await db.execute(stmt)
    product = result.scalars().first()
    if not product:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"message": f"Product with sku '{sku}' not found in DB"},
        )
    return _product_to_dict(product)


@router.post(
    "/tasks/create-from-factory", response_model=ProductFactoryCreateResponseDTO
)
async def create_product_task_from_factory(
    payload: ProductFactoryCreateRequestDTO,
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
    current_user=Depends(require_role([RoleEnum.SEO])),
    product_service: ProductService = Depends(get_product_service),
):
    run_id = payload.run_id or str(uuid4())
    now = datetime.now(UTC).isoformat()
    task = {
        "status": "IN_PROGRESS",
        "controller": payload.controller.value,
        "factory_id": payload.factory_id,
        "source_items": 0,
        "mapped_items": 0,
        "payload_items": 0,
        "issues": [],
        "products": [],
        "current_step": "prepare_queued",
        "current_step_started_at": now,
        "updated_at": now,
        "heartbeat_at": now,
        "progress_total": 0,
        "progress_completed": 0,
        "progress_percent": 0,
    }
    await _save_factory_task_state(
        run_id,
        task,
        created_by_user_id=current_user.id,
    )

    await enqueue_job(
        "prepare_factory_products_task",
        process_id=run_id,
        payload=payload.model_dump(mode="json"),
    )

    return ProductFactoryCreateResponseDTO(
        success=True,
        run_id=run_id,
        controller=payload.controller,
        factory_id=payload.factory_id,
        source_items=0,
        mapped_items=0,
        payload_items=0,
        issues=[],
        process_id=run_id,
        process_state="IN_PROGRESS",
    )


@router.get("/tasks/create-from-factory/latest")
async def get_latest_factory_prepare_task(
    db: AsyncSession = Depends(get_db),
    _current_user=Depends(require_role([RoleEnum.SEO])),
):
    final_steps = {
        "otto_create_done",
        "availability_done",
        "otto_create_failed",
        "availability_failed",
    }
    stmt = (
        select(FactoryTaskState)
        .where(
            or_(
                FactoryTaskState.current_step.is_(None),
                FactoryTaskState.current_step.notin_(final_steps),
            )
        )
        .order_by(FactoryTaskState.updated_at.desc())
        .limit(1)
    )
    record = (await db.execute(stmt)).scalars().first()
    if record is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "message": "No saved creation draft"},
        )

    process_id = record.process_id
    task = await _get_factory_task_state(process_id)
    if task is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "message": "Saved creation draft not found"},
        )
    (
        task,
        heartbeat_lag_sec,
        step_elapsed_sec,
        is_stuck,
    ) = await _mark_factory_task_stale_if_needed(process_id, task)
    return {
        "success": True,
        "process_id": process_id,
        "process_state": task.get("status"),
        "heartbeat_lag_sec": heartbeat_lag_sec,
        "step_elapsed_sec": step_elapsed_sec,
        "stuck": is_stuck or bool(task.get("stuck")),
        "stuck_message": task.get("stuck_message"),
        **task,
    }


@router.get("/tasks/create-from-factory/{process_id}")
async def get_factory_prepare_task(process_id: str):
    task = await _get_factory_task_state(process_id)
    if task is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "success": False,
                "message": "Task not found",
                "process_id": process_id,
            },
        )
    (
        task,
        heartbeat_lag_sec,
        step_elapsed_sec,
        is_stuck,
    ) = await _mark_factory_task_stale_if_needed(process_id, task)

    return {
        "success": True,
        "process_id": process_id,
        "process_state": task.get("status"),
        "heartbeat_lag_sec": heartbeat_lag_sec,
        "step_elapsed_sec": step_elapsed_sec,
        "stuck": is_stuck or bool(task.get("stuck")),
        "stuck_message": task.get("stuck_message"),
        **task,
    }


@router.delete("/tasks/create-from-factory/{process_id}")
async def delete_factory_prepare_task(process_id: str):
    FACTORY_PREPARE_TASKS.pop(process_id, None)
    await FACTORY_TASK_STATE_SERVICE.delete_task(process_id)
    return {
        "success": True,
        "process_id": process_id,
    }


@router.patch("/tasks/create-from-factory/{process_id}/draft")
async def save_factory_prepare_task_draft(
    process_id: str,
    payload: dict[str, Any],
    current_user=Depends(require_role([RoleEnum.SEO])),
):
    task = await _get_factory_task_state(process_id)
    if task is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "success": False,
                "message": "Task not found",
                "process_id": process_id,
            },
        )

    task_step = str(task.get("current_step") or "")
    task_status = str(task.get("status") or "")
    is_enrichment_running = task_status == "IN_PROGRESS" and task_step.startswith(
        "ai_enrichment"
    )

    products = payload.get("products")
    if isinstance(products, list) and not is_enrichment_running:
        task["products"] = products

    current_step = payload.get("current_step")
    if (
        isinstance(current_step, str)
        and current_step.strip()
        and not is_enrichment_running
    ):
        task["current_step"] = current_step.strip()

    frontend_draft_payload = payload.get("frontend_draft")
    frontend_draft = (
        dict(task.get("frontend_draft"))
        if isinstance(task.get("frontend_draft"), dict)
        else {}
    )
    if isinstance(frontend_draft_payload, dict):
        if is_enrichment_running:
            frontend_draft_payload = {
                key: value
                for key, value in frontend_draft_payload.items()
                if key != "workflowStep"
            }
        frontend_draft.update(frontend_draft_payload)
    task["frontend_draft"] = frontend_draft
    task["updated_at"] = datetime.now(UTC).isoformat()

    await _save_factory_task_state(
        process_id,
        task,
        created_by_user_id=current_user.id,
    )
    return {
        "success": True,
        "process_id": process_id,
        "updated_at": task.get("updated_at"),
    }


@router.websocket("/tasks/create-from-factory/{process_id}/ws")
async def factory_prepare_task_ws(websocket: WebSocket, process_id: str):
    await websocket.accept()
    try:
        while True:
            task = await _get_factory_task_state(process_id)
            if task is None:
                await websocket.send_json(
                    {
                        "success": False,
                        "process_id": process_id,
                        "message": "Task not found",
                    }
                )
                await websocket.close(code=4404)
                return
            (
                task,
                heartbeat_lag_sec,
                step_elapsed_sec,
                _is_stuck,
            ) = await _mark_factory_task_stale_if_needed(process_id, task)

            await websocket.send_json(
                {
                    "success": True,
                    "process_id": process_id,
                    "process_state": task.get("status"),
                    "heartbeat_lag_sec": heartbeat_lag_sec,
                    "step_elapsed_sec": step_elapsed_sec,
                    **task,
                }
            )

            if task.get("status") in {"DONE", "FAILED"}:
                await websocket.close(code=1000)
                return

            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return


def _compact_source_specifics(source_item: dict[str, Any] | None) -> dict[str, str]:
    if not isinstance(source_item, dict):
        return {}
    xml_data = source_item.get("CustomItemSpecifics")
    if not isinstance(xml_data, str) or not xml_data.strip():
        return {}
    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError:
        return {}

    result: dict[str, str] = {}
    for item in root.findall("NameValueList"):
        name = item.findtext("Name")
        if not name:
            continue
        values = [
            value.text.strip()
            for value in item.findall("Value")
            if value.text and value.text.strip()
        ]
        if values:
            result[name.strip()] = ", ".join(values)
    return result


def _normalized_identity_value(value: Any) -> str:
    return str(value or "").strip().casefold()


def _source_identity_values(source_item: dict[str, Any] | None) -> set[str]:
    if not isinstance(source_item, dict):
        return set()

    specifics = _compact_source_specifics(source_item)
    raw_values = [
        source_item.get("EAN"),
        source_item.get("ean"),
        source_item.get("SKU"),
        source_item.get("sku"),
        source_item.get("productReference"),
        source_item.get("product_reference"),
        specifics.get("EAN"),
        specifics.get("ean"),
    ]
    return {
        normalized
        for normalized in (_normalized_identity_value(value) for value in raw_values)
        if normalized
    }


def _product_identity_values(product: dict[str, Any] | None) -> set[str]:
    if not isinstance(product, dict):
        return set()
    raw_values = [
        product.get("ean"),
        product.get("EAN"),
        product.get("sku"),
        product.get("SKU"),
        product.get("productReference"),
        product.get("product_reference"),
    ]
    return {
        normalized
        for normalized in (_normalized_identity_value(value) for value in raw_values)
        if normalized
    }


def _build_source_item_lookup(
    source_items: list[Any],
) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for source_item in source_items:
        if not isinstance(source_item, dict):
            continue
        for identity in _source_identity_values(source_item):
            lookup.setdefault(identity, source_item)
    return lookup


def _find_source_item_for_product(
    *,
    product: dict[str, Any],
    index: int,
    source_items: list[Any],
    source_items_by_identity: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    for identity in _product_identity_values(product):
        source_item = source_items_by_identity.get(identity)
        if source_item is not None:
            return source_item

    if index < len(source_items) and isinstance(source_items[index], dict):
        fallback = source_items[index]
        product_identities = _product_identity_values(product)
        fallback_identities = _source_identity_values(fallback)
        if not product_identities or product_identities.intersection(fallback_identities):
            return fallback

        MAPPER_LOGGER.warning(
            "step=source_item_index_mismatch index=%s product_ids=%s source_ids=%s",
            index,
            sorted(product_identities),
            sorted(fallback_identities),
        )

    return None


def _build_aftercool_comparison(
    *,
    source_item: dict[str, Any] | None,
    generated_product: dict[str, Any],
) -> dict[str, Any]:
    source = source_item if isinstance(source_item, dict) else {}
    specifics = _compact_source_specifics(source)
    description = (
        generated_product.get("productDescription")
        if isinstance(generated_product.get("productDescription"), dict)
        else {}
    )
    generated_attrs = description.get("attributes")
    aftercool_attrs = [
        {"name": key, "values": [value]}
        for key, value in sorted(specifics.items(), key=lambda item: item[0].casefold())
        if key and value
    ]

    return {
        "approved": False,
        "aftercool": {
            "title": source.get("Artikelbeschreibung"),
            "description": (
                source.get("StammartikelBeschreibungDetailsHtml")
                or source.get("TranslatedDescription")
                or source.get("Description")
                or source.get("Beschreibung")
            ),
            "attributes": aftercool_attrs,
            "price": source.get("Startpreis"),
            "ean": source.get("EAN") or source.get("ean") or specifics.get("EAN"),
        },
        "generated": {
            "title": description.get("productLine"),
            "description": description.get("description"),
            "bulletPoints": description.get("bulletPoints") or [],
            "attributes": generated_attrs if isinstance(generated_attrs, list) else [],
            "category": description.get("category"),
            "ean": generated_product.get("ean"),
        },
    }


async def _run_factory_enrichment_task(
    *,
    process_id: str,
    payload: dict[str, Any],
    product_service: ProductService,
) -> None:
    from app.mapper.product_mapper import ProductMapper

    task = await _get_factory_task_state(process_id)
    products = payload.get("products")
    if task is None or not isinstance(products, list) or not products:
        MAPPER_LOGGER.error(
            "Ошибка начала генерации: process_id=%s has_task=%s has_products=%s",
            process_id,
            task is not None,
            isinstance(products, list) and bool(products),
        )
        return

    source_items_raw = task.get("source_items_raw")
    source_items = source_items_raw if isinstance(source_items_raw, list) else []
    source_items_by_identity = _build_source_item_lookup(source_items)
    controller_value = str(
        task.get("controller") or payload.get("controller") or "jv"
    ).lower()
    controller = Controller(controller_value)
    category_group_contexts = await _load_category_group_contexts()
    ai_mapper = ProductMapper(
        products=[],
        controller=controller.value,
        otto_client=product_service.client,
        category_group_contexts=category_group_contexts,
    )

    now = datetime.now(UTC).isoformat()
    task["status"] = "IN_PROGRESS"
    task["current_step"] = "ai_enrichment_in_progress"
    task["current_step_started_at"] = now
    task["updated_at"] = now
    task["heartbeat_at"] = now
    task["stuck"] = False
    task["stuck_message"] = None
    task["progress_total"] = len(products)
    task["progress_completed"] = 0
    task["progress_percent"] = 0
    task["products"] = products
    task["partial_products_by_index"] = {}
    await _save_factory_task_state(process_id, task)

    MAPPER_LOGGER.info(
        "MAPPER начался успешно: process_id=%s products=%s",
        process_id,
        len(products),
    )

    heartbeat_stop = asyncio.Event()

    async def _heartbeat_loop() -> None:
        while not heartbeat_stop.is_set():
            current = FACTORY_PREPARE_TASKS.get(process_id)
            if current:
                now_heartbeat = datetime.now(UTC).isoformat()
                current["heartbeat_at"] = now_heartbeat
                current["updated_at"] = now_heartbeat
                await _save_factory_task_state(process_id, current)
            await asyncio.sleep(FACTORY_HEARTBEAT_INTERVAL_SEC)

    heartbeat_task = asyncio.create_task(_heartbeat_loop())

    enriched_products: list[dict[str, Any] | None] = [None] * len(products)
    item_failures: list[str] = []
    work_queue: asyncio.Queue[tuple[int, dict[str, Any]] | None] = asyncio.Queue()
    progress_lock = asyncio.Lock()

    try:

        async def _enrich_one(index: int, item: dict[str, Any]) -> None:
            model = ProductPayload.model_validate(item)
            model_dump = model.model_dump(mode="json", exclude_none=True)
            source_item = _find_source_item_for_product(
                product=model_dump,
                index=index,
                source_items=source_items,
                source_items_by_identity=source_items_by_identity,
            )
            MAPPER_LOGGER.info(
                "step=category_approval_enrichment_item_start process_id=%s index=%s sku=%s category=%s source_available=%s",
                process_id,
                index,
                model.sku,
                model.productDescription.category,
                source_item is not None,
            )
            enriched_payload = await asyncio.wait_for(
                ai_mapper.enrich_after_category_approval(
                    model_dump,
                    source_item=source_item,
                ),
                timeout=FACTORY_AI_ENRICH_ITEM_TIMEOUT_SEC,
            )
            enriched_model = ProductPayload.model_validate(enriched_payload)
            enriched_dump = enriched_model.model_dump(
                mode="json", exclude_none=True
            )
            enriched_dump["aftercoolComparison"] = _build_aftercool_comparison(
                source_item=source_item,
                generated_product=enriched_dump,
            )
            enriched_products[index] = enriched_dump
            async with progress_lock:
                by_index_raw = task.get("partial_products_by_index")
                by_index = by_index_raw if isinstance(by_index_raw, dict) else {}
                by_index[str(index)] = enriched_dump
                task["partial_products_by_index"] = by_index
                current_products = task.get("products")
                next_products = list(current_products) if isinstance(current_products, list) else list(products)
                if index < len(next_products):
                    next_products[index] = enriched_dump
                task["products"] = next_products
                task["progress_completed"] = int(task.get("progress_completed", 0)) + 1
                task["progress_percent"] = int(
                    round((task["progress_completed"] / max(1, len(products))) * 100)
                )
                task["updated_at"] = datetime.now(UTC).isoformat()
                await _save_factory_task_state(process_id, task)
            MAPPER_LOGGER.info(
                "step=category_approval_enrichment_item_done process_id=%s index=%s sku=%s bullet_points=%s attributes=%s",
                process_id,
                index,
                enriched_model.sku,
                len(enriched_model.productDescription.bulletPoints),
                len(enriched_model.productDescription.attributes),
            )

        async def _worker(worker_id: int) -> None:
            while True:
                queued = await work_queue.get()
                try:
                    if queued is None:
                        return
                    index, item = queued
                    try:
                        await _enrich_one(index, item)
                    except Exception as exc:
                        fallback_model = ProductPayload.model_validate(item)
                        fallback_dump = fallback_model.model_dump(
                            mode="json",
                            exclude_none=True,
                        )
                        fallback_source_item = _find_source_item_for_product(
                            product=fallback_dump,
                            index=index,
                            source_items=source_items,
                            source_items_by_identity=source_items_by_identity,
                        )
                        fallback_dump["aftercoolComparison"] = _build_aftercool_comparison(
                            source_item=fallback_source_item,
                            generated_product=fallback_dump,
                        )
                        enriched_products[index] = fallback_dump
                        message = f"AI enrichment failed at index={index} sku={fallback_model.sku}: {exc}"
                        item_failures.append(message)
                        MAPPER_LOGGER.exception(
                            "step=category_approval_enrichment_item_failed process_id=%s worker=%s index=%s sku=%s error=%s",
                            process_id,
                            worker_id,
                            index,
                            fallback_model.sku,
                            exc,
                        )
                        async with progress_lock:
                            by_index_raw = task.get("partial_products_by_index")
                            by_index = by_index_raw if isinstance(by_index_raw, dict) else {}
                            by_index[str(index)] = fallback_dump
                            task["partial_products_by_index"] = by_index
                            current_products = task.get("products")
                            next_products = list(current_products) if isinstance(current_products, list) else list(products)
                            if index < len(next_products):
                                next_products[index] = fallback_dump
                            task["products"] = next_products
                            task["progress_completed"] = (
                                int(task.get("progress_completed", 0)) + 1
                            )
                            task["progress_percent"] = int(
                                round(
                                    (task["progress_completed"] / max(1, len(products)))
                                    * 100
                                )
                            )
                            task["updated_at"] = datetime.now(UTC).isoformat()
                            await _save_factory_task_state(process_id, task)
                finally:
                    work_queue.task_done()

        for index, item in enumerate(products):
            await work_queue.put((index, item))

        worker_count = min(FACTORY_PRODUCT_CONCURRENCY, len(products))
        workers = [
            asyncio.create_task(_worker(worker_id)) for worker_id in range(worker_count)
        ]
        for _ in workers:
            await work_queue.put(None)
        await work_queue.join()
        await asyncio.gather(*workers)

        task["status"] = "DONE"
        task["products"] = [
            item for item in enriched_products if isinstance(item, dict)
        ]
        task["partial_products_by_index"] = {}
        task["current_step"] = "ai_enrichment_done"
        task["current_step_started_at"] = datetime.now(UTC).isoformat()
        task["updated_at"] = task["current_step_started_at"]
        task["heartbeat_at"] = task["current_step_started_at"]
        task["enriched_at"] = task["current_step_started_at"]
        task["progress_completed"] = len(products)
        task["progress_total"] = len(products)
        task["progress_percent"] = 100
        if item_failures:
            task["issues"] = [
                *item_failures[:100],
                *(
                    [f"{len(item_failures) - 100} more AI enrichment item failures"]
                    if len(item_failures) > 100
                    else []
                ),
            ]
        await _save_factory_task_state(process_id, task)
        MAPPER_LOGGER.info(
            "Маппер полностью закончен process_id=%s products=%s item_failures=%s",
            process_id,
            len(task["products"]),
            len(item_failures),
        )
    except Exception as exc:
        task["status"] = "FAILED"
        task["current_step"] = "ai_enrichment_failed"
        task["current_step_started_at"] = datetime.now(UTC).isoformat()
        task["updated_at"] = task["current_step_started_at"]
        task["heartbeat_at"] = task["current_step_started_at"]
        task["issues"] = [str(exc)]
        await _save_factory_task_state(process_id, task)
        MAPPER_LOGGER.exception(
            "Ошибка генерации process_id=%s error=%s",
            process_id,
            exc,
        )
    finally:
        heartbeat_stop.set()
        try:
            await heartbeat_task
        except Exception:
            pass


@router.post("/tasks/create-from-factory/{process_id}/enrich")
async def enrich_factory_prepared_products(
    process_id: str,
    payload: dict[str, Any],
    product_service: ProductService = Depends(get_product_service),
):
    task = await _get_factory_task_state(process_id)
    MAPPER_LOGGER.info(
        "step=category_approval_enrichment_start process_id=%s has_task=%s",
        process_id,
        task is not None,
    )
    products = payload.get("products")
    if not isinstance(products, list) or not products:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "products must be a non-empty array"},
        )

    controller_value = str(
        (task or {}).get("controller") or payload.get("controller") or "jv"
    ).lower()
    try:
        controller = Controller(controller_value)
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "message": f"Invalid controller: {controller_value}",
                "process_id": process_id,
            },
        )

    if (
        task is not None
        and task.get("status") == "IN_PROGRESS"
        and task.get("current_step") == "ai_enrichment_in_progress"
    ):
        return {
            "success": True,
            "process_id": process_id,
            "process_state": "IN_PROGRESS",
            "queued": False,
        }

    if task is not None:
        now = datetime.now(UTC).isoformat()
        task["status"] = "IN_PROGRESS"
        task["current_step"] = "ai_enrichment_queued"
        task["current_step_started_at"] = now
        task["updated_at"] = now
        task["heartbeat_at"] = now
        task["stuck"] = False
        task["stuck_message"] = None
        task["progress_total"] = len(products)
        task["progress_completed"] = 0
        task["progress_percent"] = 0
        task["products"] = products
        task["partial_products_by_index"] = {}
        await _save_factory_task_state(process_id, task)

    await enqueue_job(
        "enrich_factory_products_task",
        process_id=process_id,
        payload=payload,
    )

    return {
        "success": True,
        "process_id": process_id,
        "process_state": "IN_PROGRESS",
        "queued": True,
    }


def _contains_cyrillic(value: str) -> bool:
    return bool(re.search(r"[А-Яа-яЁё]", value or ""))


async def _load_attribute_allowed_value_lookup() -> dict[str, dict[str, str]]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Attribute)
            .options(selectinload(Attribute.allowed_values))
            .order_by(Attribute.name.asc())
        )
        lookup: dict[str, dict[str, str]] = {}
        for attr in result.scalars().unique().all():
            attr_key = normalize_translation_text(attr.name).casefold()
            if not attr_key:
                continue
            values: dict[str, str] = {}
            for item in attr.allowed_values:
                original = normalize_translation_text(item.value)
                if not original:
                    continue
                values[original.casefold()] = original
                if item.value_ru:
                    values[normalize_translation_text(item.value_ru).casefold()] = original
            if values:
                lookup[attr_key] = values
        return lookup


async def _translate_user_attribute_values_for_otto(
    products: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    allowed_value_lookup = await _load_attribute_allowed_value_lookup()
    async with SessionLocal() as session:
        translator = TranslationService(session)
        translated_products: list[dict[str, Any]] = []
        for product in products:
            next_product = dict(product)
            description = dict(next_product.get("productDescription") or {})
            attributes = description.get("attributes")
            if not isinstance(attributes, list):
                translated_products.append(next_product)
                continue

            translated_attributes: list[Any] = []
            for raw_attr in attributes:
                if not isinstance(raw_attr, dict):
                    translated_attributes.append(raw_attr)
                    continue
                attr = dict(raw_attr)
                attr_name = normalize_translation_text(str(attr.get("name") or ""))
                allowed_map = allowed_value_lookup.get(attr_name.casefold(), {})
                raw_values = attr.get("values")
                if not isinstance(raw_values, list):
                    translated_attributes.append(attr)
                    continue

                next_values: list[Any] = []
                for raw_value in raw_values:
                    if not isinstance(raw_value, str):
                        next_values.append(raw_value)
                        continue
                    normalized_value = normalize_translation_text(raw_value)
                    if not normalized_value:
                        next_values.append(raw_value)
                        continue

                    allowed_original = allowed_map.get(normalized_value.casefold())
                    if allowed_original:
                        next_values.append(allowed_original)
                        continue

                    if not _contains_cyrillic(normalized_value):
                        next_values.append(normalized_value)
                        continue

                    try:
                        next_values.append(
                            await translator.translate(
                                normalized_value,
                                source_lang="RU",
                                target_lang="DE",
                                context="user_attribute_input",
                            )
                        )
                    except Exception as exc:
                        MAPPER_LOGGER.warning(
                            "step=translate_user_attribute_failed attribute=%s value=%s error=%s",
                            attr_name,
                            normalized_value,
                            exc,
                        )
                        next_values.append(normalized_value)

                attr["values"] = next_values
                translated_attributes.append(attr)

            description["attributes"] = translated_attributes
            next_product["productDescription"] = description
            translated_products.append(next_product)
        return translated_products


OTTO_ERROR_TRANSLATION_FIELDS = {"title", "message", "description", "detail"}


async def _translate_otto_error_payload_for_ui(value: Any) -> Any:
    async with SessionLocal() as session:
        translator = TranslationService(session)

        async def translate_value(current: Any) -> Any:
            if isinstance(current, list):
                return [await translate_value(item) for item in current]
            if not isinstance(current, dict):
                return current

            translated: dict[str, Any] = {}
            for key, raw_value in current.items():
                if (
                    key in OTTO_ERROR_TRANSLATION_FIELDS
                    and isinstance(raw_value, str)
                    and normalize_translation_text(raw_value)
                ):
                    translated[f"{key}Original"] = raw_value
                    try:
                        translated[key] = await translator.translate(
                            raw_value,
                            source_lang="DE",
                            target_lang="RU",
                            context="otto_error",
                        )
                    except Exception as exc:
                        MAPPER_LOGGER.warning(
                            "step=translate_otto_error_failed field=%s error=%s",
                            key,
                            exc,
                        )
                        translated[key] = raw_value
                    continue

                translated[key] = await translate_value(raw_value)
            return translated

        return await translate_value(value)


async def _run_factory_submit_task(
    *,
    process_id: str,
    payload: dict[str, Any],
    product_service: ProductService,
) -> None:
    task = await _get_factory_task_state(process_id)
    MAPPER_LOGGER.info(
        "step=submit_final_products_start process_id=%s has_task=%s",
        process_id,
        task is not None,
    )
    products = payload.get("products")
    if not isinstance(products, list) or not products:
        MAPPER_LOGGER.error(
            "step=submit_final_products_failed process_id=%s error=empty_products",
            process_id,
        )
        return

    validated: list[dict[str, Any]] = []
    validated_models: list[ProductPayload] = []
    controller_value = str(
        (task or {}).get("controller") or payload.get("controller") or "jv"
    ).lower()

    try:
        controller = Controller(controller_value)
        if task is not None:
            task["status"] = "IN_PROGRESS"
            task["current_step"] = "final_validation_in_progress"
            task["updated_at"] = datetime.now(UTC).isoformat()
            task["heartbeat_at"] = task["updated_at"]
            await _save_factory_task_state(process_id, task)

        products_for_otto = await _translate_user_attribute_values_for_otto(products)

        for index, item in enumerate(products_for_otto):
            model = ProductPayload.model_validate(item)
            MAPPER_LOGGER.info(
                "step=submit_final_products_item_validated process_id=%s index=%s sku=%s category=%s",
                process_id,
                index,
                model.sku,
                model.productDescription.category,
            )
            validated_models.append(model)
            validated.append(model.model_dump(mode="json", exclude_none=True))

        factory_id = str(
            (task or {}).get("factory_id") or payload.get("factory_id") or "unknown"
        )
        file_path = _save_final_edited_payloads_snapshot(
            payloads=validated,
            controller=controller,
            factory_id=factory_id,
            process_id=process_id,
        )
        if task is None:
            task = {
                "process_id": process_id,
                "controller": controller.value,
                "factory_id": factory_id,
                "status": "IN_PROGRESS",
                "created_at": datetime.now(UTC).isoformat(),
            }
        task["final_snapshot_path"] = file_path.as_posix()
        task["final_products_count"] = len(validated)
        task["current_step"] = "otto_create_in_progress"
        task["updated_at"] = datetime.now(UTC).isoformat()
        task["heartbeat_at"] = task["updated_at"]
        await _save_factory_task_state(process_id, task)

        MAPPER_LOGGER.info(
            "step=submit_final_products_create_start process_id=%s products=%s",
            process_id,
            len(validated_models),
        )
        (
            otto_process_id,
            otto_state,
            update_result,
            failed_result,
        ) = await _submit_products_to_otto_in_batches(
            product_service=product_service,
            controller=controller,
            products=validated_models,
        )

        task["otto_process_id"] = otto_process_id
        task["otto_create_state"] = otto_state
        task["otto_update_result"] = update_result
        task["otto_failed_result_original"] = failed_result
        task["otto_failed_result"] = (
            await _translate_otto_error_payload_for_ui(failed_result)
            if failed_result
            else failed_result
        )
        task["updated_at"] = datetime.now(UTC).isoformat()
        task["heartbeat_at"] = task["updated_at"]
        task["status"] = (
            "DONE" if int((update_result or {}).get("failed") or 0) == 0 else "FAILED"
        )
        task["current_step"] = "otto_create_done"
        task["products_count"] = len(validated_models)
        await _save_factory_task_state(process_id, task)

        succeeded_count = int((update_result or {}).get("succeeded") or 0)
        if task["status"] == "DONE" and succeeded_count >= len(validated_models):
            task["current_step"] = "availability_in_progress"
            task["progress_total"] = len(validated)
            task["progress_completed"] = 0
            task["progress_percent"] = 0
            task["updated_at"] = datetime.now(UTC).isoformat()
            task["heartbeat_at"] = task["updated_at"]
            await _save_factory_task_state(process_id, task)

            availability_errors: list[dict[str, str]] = []
            availability_queue: asyncio.Queue[tuple[int, dict[str, Any]] | None] = (
                asyncio.Queue()
            )
            availability_lock = asyncio.Lock()

            async def _submit_availability(index: int, item: dict[str, Any]) -> None:
                sku = str(item.get("sku") or "").strip()
                shipping_profile_id = str(item.get("shippingProfileID") or "").strip()
                if not sku:
                    raise ValueError("missing sku")
                if not shipping_profile_id:
                    raise ValueError("missing shipping profile")
                availability_result = await product_service.create_availability(
                    Availability(
                        sku=sku,
                        quantity="20",
                        shippingProfileID=shipping_profile_id,
                        controller=controller,
                    )
                )
                quantity_ok = bool(
                    availability_result.update_quantity
                    and availability_result.update_quantity.success
                )
                delivery_ok = bool(
                    availability_result.update_delivery
                    and availability_result.update_delivery.success
                )
                if not quantity_ok or not delivery_ok:
                    quantity_error = (
                        availability_result.update_quantity.errors
                        if availability_result.update_quantity
                        else ""
                    )
                    delivery_error = (
                        availability_result.update_delivery.errors
                        if availability_result.update_delivery
                        else ""
                    )
                    availability_errors.append(
                        {
                            "variation": sku,
                            "code": "availability_failed",
                            "title": f"quantity={quantity_error or 'ok'}, delivery={delivery_error or 'ok'}",
                            "jsonPath": "availability",
                        }
                    )
                async with availability_lock:
                    task["progress_completed"] = (
                        int(task.get("progress_completed", 0)) + 1
                    )
                    task["progress_percent"] = int(
                        round(
                            (task["progress_completed"] / max(1, len(validated))) * 100
                        )
                    )
                    task["updated_at"] = datetime.now(UTC).isoformat()
                    task["heartbeat_at"] = task["updated_at"]
                    await _save_factory_task_state(process_id, task)
                MAPPER_LOGGER.info(
                    "step=submit_availability_item_done process_id=%s index=%s sku=%s quantity_ok=%s delivery_ok=%s",
                    process_id,
                    index,
                    sku,
                    quantity_ok,
                    delivery_ok,
                )

            async def _availability_worker(worker_id: int) -> None:
                while True:
                    queued = await availability_queue.get()
                    try:
                        if queued is None:
                            return
                        index, item = queued
                        try:
                            await _submit_availability(index, item)
                        except Exception as exc:
                            sku = str(item.get("sku") or "unknown").strip() or "unknown"
                            availability_errors.append(
                                {
                                    "variation": sku,
                                    "code": "availability_failed",
                                    "title": str(exc),
                                    "jsonPath": "availability",
                                }
                            )
                            MAPPER_LOGGER.exception(
                                "step=submit_availability_item_failed process_id=%s worker=%s index=%s sku=%s error=%s",
                                process_id,
                                worker_id,
                                index,
                                sku,
                                exc,
                            )
                            async with availability_lock:
                                task["progress_completed"] = (
                                    int(task.get("progress_completed", 0)) + 1
                                )
                                task["progress_percent"] = int(
                                    round(
                                        (
                                            task["progress_completed"]
                                            / max(1, len(validated))
                                        )
                                        * 100
                                    )
                                )
                                task["updated_at"] = datetime.now(UTC).isoformat()
                                task["heartbeat_at"] = task["updated_at"]
                                await _save_factory_task_state(process_id, task)
                    finally:
                        availability_queue.task_done()

            for index, item in enumerate(validated):
                await availability_queue.put((index, item))

            availability_worker_count = min(FACTORY_PRODUCT_CONCURRENCY, len(validated))
            availability_workers = [
                asyncio.create_task(_availability_worker(worker_id))
                for worker_id in range(availability_worker_count)
            ]
            for _ in availability_workers:
                await availability_queue.put(None)
            await availability_queue.join()
            await asyncio.gather(*availability_workers)
            task["availability_errors_original"] = availability_errors
            task["availability_errors"] = (
                await _translate_otto_error_payload_for_ui(availability_errors)
                if availability_errors
                else availability_errors
            )
            task["availability_failed"] = len(availability_errors)
            task["status"] = "FAILED" if availability_errors else "DONE"
            task["current_step"] = "availability_done"
            task["updated_at"] = datetime.now(UTC).isoformat()
            task["heartbeat_at"] = task["updated_at"]
            task["progress_completed"] = len(validated)
            task["progress_total"] = len(validated)
            task["progress_percent"] = 100
            if availability_errors:
                task["issues"] = [
                    f"{item['variation']}: {item['code']}"
                    for item in availability_errors[:100]
                ]
            await _save_factory_task_state(process_id, task)

        MAPPER_LOGGER.info(
            "step=submit_final_products_done process_id=%s status=%s products=%s",
            process_id,
            task["status"],
            len(validated_models),
        )
    except Exception as exc:
        current = task or {
            "process_id": process_id,
            "status": "FAILED",
        }
        current["status"] = "FAILED"
        current["current_step"] = "otto_create_failed"
        current["updated_at"] = datetime.now(UTC).isoformat()
        current["heartbeat_at"] = current["updated_at"]
        current["issues"] = [str(exc)]
        await _save_factory_task_state(process_id, current)
        MAPPER_LOGGER.exception(
            "step=submit_final_products_failed process_id=%s error=%s",
            process_id,
            exc,
        )


@router.post("/tasks/create-from-factory/{process_id}/submit")
async def submit_factory_prepared_products(
    process_id: str,
    payload: dict[str, Any],
):
    task = await _get_factory_task_state(process_id)
    MAPPER_LOGGER.info(
        "step=submit_final_products_queue_start process_id=%s has_task=%s",
        process_id,
        task is not None,
    )
    products = payload.get("products")
    if not isinstance(products, list) or not products:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "products must be a non-empty array"},
        )

    controller_value = str(
        (task or {}).get("controller") or payload.get("controller") or "jv"
    ).lower()
    try:
        controller = Controller(controller_value)
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "message": f"Invalid controller: {controller_value}",
                "process_id": process_id,
            },
        )

    if task is not None:
        now = datetime.now(UTC).isoformat()
        task["status"] = "IN_PROGRESS"
        task["current_step"] = "otto_create_queued"
        task["current_step_started_at"] = now
        task["updated_at"] = now
        task["heartbeat_at"] = now
        task["progress_total"] = len(products)
        task["progress_completed"] = 0
        task["progress_percent"] = 0
        await _save_factory_task_state(process_id, task)

    await enqueue_job(
        "submit_factory_products_task",
        process_id=process_id,
        payload=payload,
    )

    return {
        "success": True,
        "process_id": process_id,
        "process_state": "IN_PROGRESS",
        "queued": True,
        "products_count": len(products),
    }


@router.get("/fetch-otto-categories-to-db")
async def fetch_otto_categories_to_db(
    product_service: ProductService = Depends(get_product_service),
    session: AsyncSession = Depends(get_db),
):
    await product_service.fetch_all_categories_to_db(session)

    return {"success": True, "message": "Category sync started"}
