"""HTTP endpoints for local product DB access and OTTO-facing workflows.

Read APIs are intentionally split:
- `/v1/products/db...` serves the local database-backed catalog
- `/v1/products/otto...` proxies OTTO marketplace product retrieval

Write/import workflows remain under `/v1/products/...`.
"""

import asyncio
from datetime import UTC, date, datetime
from io import BytesIO
import json
import logging
from pathlib import Path
import re
from typing import Any, List, Optional
from uuid import uuid4

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Form,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from openpyxl import load_workbook

from app.database import SessionLocal
from app.dependencies import (
    get_afterbuy_login,
    get_current_user,
    get_product_creation_service,
    get_product_service,
    require_role,
)
from app.database import get_db
from app.models.product_import_tasks import ProductImportTask
from app.models.product_creation_tasks import (
    ProductCreationTask,
    ProductCreationTaskItem,
)
from app.models.products import Product
from app.schemas.marketplaceStatus import MarketPlaceStatus
from app.schemas.product_creation import (
    ProductCreationErrorResponse,
    ProductCreationFileResponse,
    ProductImportTaskDTO,
    ProductImportTaskListResponse,
    ProductCreationPreparedRequest,
    ProductCreationPrepareResponse,
    ProductSpreadsheetImportResponse,
)
from app.schemas.product import (
    ProductResponse,
    CreateProductRequest,
    Product as ProductPayload,
    Status,
    Availability,
    UpdateQuantity,
    UpdateProductDelivery,
)
from app.schemas.product_response import (
    ProductCreateResponse,
    AvailabilityResponse,
    DeleteProductResponse,
)
from app.schemas.product_tasks import (
    ProductFactoryCreateRequestDTO,
    ProductFactoryCreateResponseDTO,
    ProductTaskCreateRequestDTO,
    ProductTaskDTO,
    ProductTaskItemDTO,
    ProductTaskListResponseDTO,
)

from app.schemas.product_query import (
    MarketplaceStatusQuery,
    ProductListQuery,
    CategoryQuery,
)
from app.schemas.enums import SortOrderEnum
from app.schemas.enums import RoleEnum
from app.schemas.enums import Controller
from app.tasks import sync_afterbuy_jv_lister_task
from app.services.afterbuy_sync_service import sync_afterbuy_to_jv_lister
from app.services.afterbuy_service import AfterbuyService
from app.services.local_product_sync_service import upsert_local_products_from_payloads
from app.mapper.seo import build_seo_description
from app.mapper.normalizer import build_normalized_product
from app.services.product_creation_service import ProductCreationService
from app.services.product_service import ProductService

router = APIRouter(
    prefix="/v1/products",
    tags=["Products"],
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
TASK_STATUS_IN_PROGRESS = "IN_PROGRESS"
TASK_STATUS_DONE = "DONE"
TASK_STATUS_FAILED = "FAILED"
CREATE_DONE_RU = "Создание успешно"
CREATE_FAILED_RU = "Создание с ошибкой"
AVAILABILITY_DONE_RU = "Доступность успешно"
AVAILABILITY_FAILED_RU = "Доступность с ошибкой"
MAPPER_LOG_PATH = (
    Path(__file__).resolve().parents[3] / "logs" / "product_mapper_flow.log"
)
MAPPER_LOGGER = logging.getLogger("product_mapper_flow")
if not MAPPER_LOGGER.handlers:
    MAPPER_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _handler = logging.FileHandler(MAPPER_LOG_PATH, encoding="utf-8")
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
    _prepared_handler = logging.FileHandler(PREPARED_UPLOAD_LOG_PATH, encoding="utf-8")
    _prepared_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    )
    PREPARED_UPLOAD_LOGGER.setLevel(logging.INFO)
    PREPARED_UPLOAD_LOGGER.addHandler(_prepared_handler)
    PREPARED_UPLOAD_LOGGER.propagate = False

FACTORY_PREPARE_TASKS: dict[str, dict[str, Any]] = {}
FACTORY_HEARTBEAT_INTERVAL_SEC = 5
FACTORY_STUCK_THRESHOLD_SEC = 45
FACTORY_FETCH_TIMEOUT_SEC = 120
FACTORY_MAP_TIMEOUT_SEC = 1800
FACTORY_NORMALIZE_TIMEOUT_SEC = 20
FACTORY_OTTO_UPDATE_TASK_MAX_POLLS = 60
FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC = 5


def _reset_log_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def _flush_logger(logger: logging.Logger) -> None:
    for handler in logger.handlers:
        try:
            handler.flush()
        except Exception:
            continue


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


def _ensure_product_identity(
    *,
    normalized: dict[str, Any],
    source_item: dict[str, Any],
    mapped_item: dict[str, Any] | None,
    index: int,
) -> None:
    source_ean = _pick_text(source_item.get("EAN"), source_item.get("ean"))
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


async def _build_factory_prepared_products(
    *,
    payload: ProductFactoryCreateRequestDTO,
    afterbuy: AfterbuyService,
    product_service: ProductService,
) -> tuple[list[ProductPayload], int, int, list[str]]:
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
            payload.controller, int(payload.factory_id)
        ),
    )
    source_items = [
        item.model_dump(mode="json", exclude_none=True) for item in source.products
    ]
    source_items = source_items[:5]
    MAPPER_LOGGER.info("step=fetch_afterbuy_products count=%s", len(source_items))
    PREPARED_UPLOAD_LOGGER.info(
        "step=fetch_afterbuy_products result=%s",
        json.dumps(
            {"count": len(source_items), "sample": source_items[:2]}, ensure_ascii=False
        ),
    )
    _flush_logger(PREPARED_UPLOAD_LOGGER)

    mapper = ProductMapper(
        products=source_items,
        controller=payload.controller.value,
        otto_client=product_service.client,
    )
    mapped_result = await _run_step_with_timeout(
        step_name="map_products",
        timeout_sec=FACTORY_MAP_TIMEOUT_SEC,
        fn=mapper.payload_deploy,
    )
    mapped_items = (
        mapped_result.get("items", []) if isinstance(mapped_result, dict) else []
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

    products_payload: list[ProductPayload] = []
    for index, source_item in enumerate(source_items):
        try:
            ean = source_item.get("EAN") or source_item.get("ean")
            MAPPER_LOGGER.info("step=normalize_start index=%s ean=%s", index, ean)
            seo_html = build_seo_description(source_item, max_chars=2000)
            normalized = await asyncio.wait_for(
                asyncio.to_thread(build_normalized_product, source_item, seo_html),
                timeout=FACTORY_NORMALIZE_TIMEOUT_SEC,
            )
            PREPARED_UPLOAD_LOGGER.info(
                "step=normalize_preview index=%s body=%s",
                index,
                json.dumps(normalized, ensure_ascii=False),
            )
            _flush_logger(PREPARED_UPLOAD_LOGGER)

            mapped_item = None
            if index < len(mapped_items) and isinstance(mapped_items[index], dict):
                mapped_item = mapped_items[index]
                product_description = normalized.get("productDescription")
                if isinstance(product_description, dict):
                    if mapped_item.get("category"):
                        product_description["category"] = mapped_item["category"]
                    if mapped_item.get("description"):
                        product_description["description"] = mapped_item["description"]
                    if mapped_item.get("bulletPoints"):
                        product_description["bulletPoints"] = mapped_item[
                            "bulletPoints"
                        ]
                    if mapped_item.get("attributes"):
                        product_description["attributes"] = (
                            _shape_attributes_for_schema(mapped_item["attributes"])
                        )
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

            products_payload.append(ProductPayload.model_validate(normalized))
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
    return products_payload, len(source_items), len(mapped_items), issues


async def _run_factory_prepare_task(
    *,
    process_id: str,
    payload: ProductFactoryCreateRequestDTO,
    afterbuy: AfterbuyService,
    product_service: ProductService,
) -> None:
    started_at = datetime.now(UTC)
    task = FACTORY_PREPARE_TASKS.get(process_id) or {}
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
        }
    )
    FACTORY_PREPARE_TASKS[process_id] = task

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
                "step=heartbeat process_id=%s current_step=%s heartbeat_count=%s",
                process_id,
                current.get("current_step"),
                current["heartbeat_count"],
            )
            await asyncio.sleep(FACTORY_HEARTBEAT_INTERVAL_SEC)

    heartbeat_task = asyncio.create_task(_heartbeat_loop())

    def _set_step(step: str) -> None:
        now = datetime.now(UTC)
        current = FACTORY_PREPARE_TASKS.get(process_id) or {}
        current["current_step"] = step
        current["current_step_started_at"] = now.isoformat()
        current["updated_at"] = now.isoformat()
        FACTORY_PREPARE_TASKS[process_id] = current
        MAPPER_LOGGER.info(
            "step=task_step_change process_id=%s current_step=%s", process_id, step
        )

    try:
        _set_step("building_prepared_products")
        products_payload, source_count, mapped_count, issues = (
            await _build_factory_prepared_products(
                payload=payload,
                afterbuy=afterbuy,
                product_service=product_service,
            )
        )
        _set_step("saving_snapshot")
        snapshot_path = _save_prepared_payloads_snapshot(
            payloads=products_payload,
            controller=payload.controller,
            factory_id=payload.factory_id,
        )
        FACTORY_PREPARE_TASKS[process_id] = {
            "status": "DONE",
            "controller": payload.controller.value,
            "factory_id": payload.factory_id,
            "source_items": source_count,
            "mapped_items": mapped_count,
            "payload_items": len(products_payload),
            "issues": issues,
            "products": [
                item.model_dump(mode="json", exclude_none=True)
                for item in products_payload
            ],
            "snapshot_path": snapshot_path.as_posix(),
            "finished_at": datetime.now(UTC).isoformat(),
            "heartbeat_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    except Exception as exc:
        MAPPER_LOGGER.exception(
            "step=factory_prepare_task_failed process_id=%s error=%s", process_id, exc
        )
        FACTORY_PREPARE_TASKS[process_id] = {
            "status": "FAILED",
            "controller": payload.controller.value,
            "factory_id": payload.factory_id,
            "issues": [str(exc)],
            "products": [],
            "finished_at": datetime.now(UTC).isoformat(),
            "heartbeat_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
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


def _to_task_item_dto(item: ProductCreationTaskItem) -> ProductTaskItemDTO:
    return ProductTaskItemDTO(
        item_index=item.item_index,
        sku=item.sku,
        product_reference=item.product_reference,
        create_status_ru=item.create_status_ru,
        availability_status_ru=item.availability_status_ru,
        error_message=item.error_message,
        payload=item.payload,
        availability_payload=item.availability_payload,
    )


def _to_task_dto(
    task: ProductCreationTask, items: list[ProductCreationTaskItem]
) -> ProductTaskDTO:
    return ProductTaskDTO(
        id=task.id,
        status=task.status,
        controller=Controller(task.controller),
        process_id=task.process_id,
        process_state=task.process_state,
        total_items=task.total_items,
        failed_items=task.failed_items,
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at,
        finished_at=task.finished_at,
        items=[_to_task_item_dto(item) for item in items],
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


def _product_list_payload(
    *,
    product_reference: Optional[str],
    page: int,
    sku: Optional[str],
    limit: int,
    category: Optional[str],
    brand_id: Optional[str],
) -> dict:
    """Build a sanitized upstream list query payload from request parameters."""
    return ProductListQuery(
        page=page,
        sku=sku,
        limit=limit,
        productReference=product_reference,
        category=category,
        brandId=brand_id,
    ).to_payload()


def _is_all_categories_value(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip().lower()
    return normalized in {"", "all", "all categories", "all category", "allcategories"}


def _normalized_product_category_expression():
    return func.lower(func.trim(Product.product_category))


@router.get("/db")
@router.get("", include_in_schema=False)
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
    """Return distinct non-empty product categories from the local DB."""
    stmt = (
        select(func.trim(Product.product_category))
        .where(Product.product_category.is_not(None))
        .distinct()
        .order_by(func.trim(Product.product_category).asc())
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


@router.get("/attributes/options")
async def get_attribute_options():
    """Return supported attribute names from attributes_list.txt."""
    if not ATTRIBUTES_LIST_PATH.exists():
        return {"items": []}

    items: list[str] = []
    for line in ATTRIBUTES_LIST_PATH.read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if value:
            items.append(value)

    return {"items": items, "total": len(items)}


@router.get("/otto", response_model=ProductResponse)
async def get_otto_products(
    product_service: ProductService = Depends(get_product_service),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=1000),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
):
    """Proxy paginated product retrieval from OTTO marketplace."""
    payload = _product_list_payload(
        product_reference=product_reference,
        page=page,
        sku=sku,
        limit=limit,
        category=category,
        brand_id=brand_id,
    )
    return await product_service.get_products(payload)


@router.get("/otto/active")
@router.get("/active", include_in_schema=False)
async def get_active_products(
    product_service: ProductService = Depends(get_product_service),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(30, ge=10, le=1000),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
):
    """Proxy active-product status listing from OTTO using typed query building."""
    payload = _product_list_payload(
        product_reference=product_reference,
        page=page,
        sku=sku,
        limit=limit,
        category=category,
        brand_id=brand_id,
    )
    return await product_service.get_active_products(payload)


@router.get("/otto/shipping-profiles")
async def get_shipping_profiles(
    controller: Controller = Query(default=Controller.JV),
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.get_shipping_profiles(controller=controller)


@router.get("/otto/update-tasks/{pid}")
@router.get("/update-tasks/{pid}", include_in_schema=False)
async def update_tasks(
    pid: str,
    controller: Controller = Query(default=Controller.JV),
    product_service: ProductService = Depends(get_product_service),
):
    """Trigger OTTO update-task execution for a single product id (`pid`)."""
    return await product_service.update_tasks(pid, controller=controller)


@router.get("/otto/failed/{pid}")
async def failed_tasks(
    pid: str,
    controller: Controller = Query(default=Controller.JV),
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.failed_tasks(pid, controller=controller)


@router.get("/otto/marketplace-status")
@router.get("/marketplace-status", include_in_schema=False)
async def get_product_status(
    product_service: ProductService = Depends(get_product_service),
    sku: Optional[str] = Query(None),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
    from_date: Optional[str] = Query(None, alias="fromDate"),
    page: int = Query(0, ge=0),
    limit: int = Query(10, ge=10, le=100),
    market_place_status: Optional[List[MarketPlaceStatus]] = Query(
        None, alias="marketPlaceStatus"
    ),
    sort_order: SortOrderEnum = Query(default=SortOrderEnum.DESC, alias="sortOrder"),
):
    """Return marketplace-status entries from OTTO for filtered products."""
    payload = MarketplaceStatusQuery(
        sku=sku,
        productReference=product_reference,
        category=category,
        brandId=brand_id,
        fromDate=from_date,
        page=page,
        limit=limit,
        marketPlaceStatus=market_place_status,
        sortOrder=sort_order,
    ).to_payload()

    return await product_service.get_marketplace_status(payload)


@router.get("/otto/categories")
@router.get("/categories", include_in_schema=False)
async def get_categories(
    product_service: ProductService = Depends(get_product_service),
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=0, le=2000),
    category: Optional[str] = Query(None),
    controller: Controller = Query(default=Controller.JV),
):
    """List available categories from OTTO, optionally filtered by category name."""
    payload = CategoryQuery(page=page, limit=limit, category=category).to_payload()
    return await product_service.get_categories(payload, controller=controller)


@router.get("/db/status/{sku}")
@router.get("/status/{sku}", include_in_schema=False)
async def get_product_by_status_path(
    sku: str,
    db: AsyncSession = Depends(get_db),
):
    """Fetch one imported product row from the local DB by SKU."""
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


@router.post("/sync-to-db")
async def sync_products_to_db(
    account_source: str = Query(default="JV", alias="accountSource"),
):
    """Legacy sync endpoint left in place for compatibility."""
    return JSONResponse(
        status_code=status.HTTP_410_GONE,
        content={
            "message": (
                "Local products table now stores spreadsheet import data. "
                f"OTTO sync is disabled for accountSource={account_source}."
            )
        },
    )


# <======= POST METHOD =======>


@router.get("/tasks", response_model=ProductTaskListResponseDTO)
async def list_product_tasks(
    current_user=Depends(require_role([RoleEnum.SEO])),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: date | None = Query(default=None, alias="dateFrom"),
    date_to: date | None = Query(default=None, alias="dateTo"),
):
    stmt = (
        select(ProductCreationTask)
        .where(ProductCreationTask.created_by_user_id == current_user.id)
        .order_by(ProductCreationTask.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(ProductCreationTask.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(
            ProductCreationTask.created_at
            >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC)
        )
    if date_to:
        stmt = stmt.where(
            ProductCreationTask.created_at
            <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC)
        )

    tasks = (await db.execute(stmt)).scalars().all()
    if not tasks:
        return ProductTaskListResponseDTO(success=True, items=[])

    task_ids = [task.id for task in tasks]
    items_stmt = (
        select(ProductCreationTaskItem)
        .where(ProductCreationTaskItem.task_id.in_(task_ids))
        .order_by(
            ProductCreationTaskItem.task_id.asc(),
            ProductCreationTaskItem.item_index.asc(),
        )
    )
    items = (await db.execute(items_stmt)).scalars().all()
    items_by_task: dict[str, list[ProductCreationTaskItem]] = {}
    for item in items:
        items_by_task.setdefault(item.task_id, []).append(item)

    return ProductTaskListResponseDTO(
        success=True,
        items=[_to_task_dto(task, items_by_task.get(task.id, [])) for task in tasks],
    )


@router.post("/tasks/create", response_model=ProductTaskDTO)
async def create_product_task(
    payload: ProductTaskCreateRequestDTO,
    current_user=Depends(require_role([RoleEnum.SEO])),
    db: AsyncSession = Depends(get_db),
    product_service: ProductService = Depends(get_product_service),
):
    if not payload.items:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "At least one product card is required"},
        )

    task_id = str(uuid4())
    task = ProductCreationTask(
        id=task_id,
        created_by_user_id=current_user.id,
        controller=payload.controller.value,
        status=TASK_STATUS_IN_PROGRESS,
        total_items=len(payload.items),
        failed_items=0,
        request_payload=payload.model_dump(mode="json"),
    )
    db.add(task)

    task_items: list[ProductCreationTaskItem] = []
    for index, item in enumerate(payload.items):
        availability_payload = {
            "sku": item.product.sku,
            "quantity": str(item.quantity),
            "shippingProfileID": item.shippingProfileID.value,
            "processingTime": item.processingTime,
            "controller": payload.controller.value,
        }
        task_item = ProductCreationTaskItem(
            task_id=task_id,
            item_index=index,
            sku=item.product.sku,
            product_reference=item.product.productReference,
            payload=item.product.model_dump(mode="json", exclude_none=True),
            availability_payload=availability_payload,
        )
        db.add(task_item)
        task_items.append(task_item)
    await db.commit()

    async def _reload_and_to_task_dto() -> ProductTaskDTO:
        await db.refresh(task)
        refreshed_items = (
            (
                await db.execute(
                    select(ProductCreationTaskItem)
                    .where(ProductCreationTaskItem.task_id == task.id)
                    .order_by(ProductCreationTaskItem.item_index.asc())
                )
            )
            .scalars()
            .all()
        )
        return _to_task_dto(task, refreshed_items)

    try:
        create_payload = CreateProductRequest(
            controller=payload.controller,
            products=[item.product for item in payload.items],
        )
        create_result = await product_service.create_or_update_products(create_payload)
        task.process_id = _extract_process_id(create_result)
        task.process_state = (create_result.state or "").upper()
        await db.commit()

        update_task_state = ""
        update_task_failed_count = 0
        if task.process_id:
            for _ in range(36):
                update_result = await product_service.update_tasks(
                    task.process_id, controller=payload.controller
                )
                update_task_state = str(update_result.get("state", "")).upper()
                update_task_failed_count = int(
                    update_result.get("failed")
                    or (update_result.get("results") or {}).get("failed")
                    or (update_result.get("summary") or {}).get("failed")
                    or 0
                )
                if update_task_state == "DONE":
                    break
                if update_task_state in {"FAILED", "ERROR"}:
                    break
                await asyncio.sleep(5)
        else:
            update_task_state = "FAILED"
            update_task_failed_count = len(task_items)

        task.process_state = update_task_state or task.process_state

        if update_task_state != "DONE" or update_task_failed_count > 0:
            task.status = TASK_STATUS_FAILED
            task.failed_items = len(task_items)
            task.finished_at = datetime.now(UTC)
            task.error_message = (
                f"Update-task failed count: {update_task_failed_count}"
                if update_task_failed_count > 0
                else "Update-task did not finish successfully"
            )
            for item in task_items:
                item.create_status_ru = CREATE_FAILED_RU
                item.availability_status_ru = AVAILABILITY_FAILED_RU
                item.error_message = (
                    "Availability не запускался: создание завершилось с ошибками"
                )
            await db.commit()
            return await _reload_and_to_task_dto()

        for item in task_items:
            item.create_status_ru = CREATE_DONE_RU

        failed_items = 0
        for item in task_items:
            availability = Availability.model_validate(item.availability_payload)
            availability_result = await product_service.create_availability(
                availability
            )
            quantity_ok = bool(
                availability_result.update_quantity
                and availability_result.update_quantity.success
            )
            delivery_ok = bool(
                availability_result.update_delivery
                and availability_result.update_delivery.success
            )
            if quantity_ok and delivery_ok:
                item.availability_status_ru = AVAILABILITY_DONE_RU
            else:
                failed_items += 1
                item.availability_status_ru = AVAILABILITY_FAILED_RU
                errors = []
                if (
                    availability_result.update_quantity
                    and availability_result.update_quantity.errors
                ):
                    errors.append(
                        f"quantity: {availability_result.update_quantity.errors}"
                    )
                if (
                    availability_result.update_delivery
                    and availability_result.update_delivery.errors
                ):
                    errors.append(
                        f"delivery: {availability_result.update_delivery.errors}"
                    )
                item.error_message = (
                    "; ".join(errors) if errors else "Ошибка availability"
                )

        task.failed_items = failed_items
        task.status = TASK_STATUS_FAILED if failed_items > 0 else TASK_STATUS_DONE
        task.finished_at = datetime.now(UTC)
        if failed_items > 0:
            task.error_message = f"Availability failed for {failed_items} item(s)"
        await db.commit()
        return await _reload_and_to_task_dto()
    except Exception as exc:
        task.status = TASK_STATUS_FAILED
        task.failed_items = len(task_items)
        task.error_message = _summarize_task_error(exc)
        task.finished_at = datetime.now(UTC)
        for item in task_items:
            if not item.create_status_ru:
                item.create_status_ru = CREATE_FAILED_RU
            if not item.availability_status_ru:
                item.availability_status_ru = AVAILABILITY_FAILED_RU
            if not item.error_message:
                item.error_message = task.error_message
        await db.commit()
        return await _reload_and_to_task_dto()


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


@router.post("/update-quantity")
async def update_delivery_stock(
    payload: list[UpdateQuantity],
    controller: Controller = Controller.JV,
    product_service: ProductService = Depends(get_product_service),
):
    data = [item.model_dump() for item in payload]
    response = await product_service.update_quantity(data, controller=controller)
    return response


@router.post("/update-product-delivery-information")
async def update_product_delivery_information(
    payload: UpdateProductDelivery,
    product_service: ProductService = Depends(get_product_service),
):
    data = payload.model_dump(mode="json", exclude_none=True)
    return await product_service.update_product_delivery_information(data)


@router.post("/update-status")
async def update_status(
    payload: Status,
    product_service: ProductService = Depends(get_product_service),
):
    """Update active/inactive state for one or more SKUs in OTTO."""
    return await product_service.update_status(
        payload.model_dump(mode="json", exclude_none=True)
    )


@router.post(
    "/prepare-from-file",
    response_model=ProductCreationPrepareResponse,
    responses={
        400: {"model": ProductCreationErrorResponse, "description": "Invalid request"},
        415: {
            "model": ProductCreationErrorResponse,
            "description": "Unsupported media type",
        },
    },
)
async def prepare_products_from_file(
    file: UploadFile = File(
        ..., description="JSON file with one object or an array of objects"
    ),
    max_chars: int = Form(default=2000, ge=300, le=5000),
    creation_service: ProductCreationService = Depends(get_product_creation_service),
):
    """Normalize and validate uploaded JSON without creating products yet.

    This is the "preview" step used by the two-phase create flow:
    parse input -> normalize to schema -> validate -> return prepared bodies.
    """
    if not file.filename or not file.filename.lower().endswith(".json"):
        return JSONResponse(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            content=ProductCreationErrorResponse(
                message="Only .json files are supported"
            ).model_dump(),
        )

    try:
        raw = await file.read()
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message=f"Unable to read uploaded file: {exc}"
            ).model_dump(),
        )

    if not raw:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message="Uploaded file is empty"
            ).model_dump(),
        )

    try:
        source_items, prepared_payloads, issues = await creation_service.prepare_upload(
            raw,
            max_chars=max_chars,
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(message=str(exc)).model_dump(),
        )
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message=f"Unable to parse/process JSON: {exc}"
            ).model_dump(),
        )

    return ProductCreationPrepareResponse(
        success=True,
        source_items=source_items,
        normalized_items=len(prepared_payloads),
        skipped_items=source_items - len(prepared_payloads),
        issues=issues,
        request_bodies=[payload for _index, payload in prepared_payloads],
    )


@router.post(
    "/create-from-prepared",
    response_model=ProductCreationFileResponse,
    responses={
        400: {"model": ProductCreationErrorResponse, "description": "Invalid request"},
        422: {
            "model": ProductCreationErrorResponse,
            "description": "Validation failed",
        },
        502: {
            "model": ProductCreationErrorResponse,
            "description": "Upstream creation failed",
        },
    },
)
async def create_products_from_prepared(
    payload: ProductCreationPreparedRequest,
    creation_service: ProductCreationService = Depends(get_product_creation_service),
):
    """Create products from pre-validated request bodies produced by prepare step."""
    if not payload.request_bodies:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message="request_bodies must contain at least one item"
            ).model_dump(),
        )

    validated_payloads, validation_issues = creation_service.validate_prepared_payloads(
        payload.request_bodies
    )
    if not validated_payloads:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ProductCreationErrorResponse(
                message="No valid request bodies to create",
                issues=validation_issues,
            ).model_dump(),
        )

    for source_index, prepared_payload in validated_payloads:
        PREPARED_UPLOAD_LOGGER.info(
            "prepared_upload_payload index=%s body=%s",
            source_index,
            json.dumps(prepared_payload, ensure_ascii=False),
        )

    created_items, create_issues = await creation_service.create_products(
        validated_payloads
    )
    issues = validation_issues + create_issues

    if created_items == 0 or any(issue.stage == "create" for issue in issues):
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=ProductCreationErrorResponse(
                message="Product creation failed for one or more items",
                issues=issues,
            ).model_dump(),
        )

    return ProductCreationFileResponse(
        success=True,
        source_items=len(payload.request_bodies),
        normalized_items=len(validated_payloads),
        created_items=created_items,
        skipped_items=len(payload.request_bodies) - created_items,
        issues=issues,
    )


@router.post(
    "/create-from-file",
    response_model=ProductCreationFileResponse,
    responses={
        400: {"model": ProductCreationErrorResponse, "description": "Invalid request"},
        415: {
            "model": ProductCreationErrorResponse,
            "description": "Unsupported media type",
        },
        422: {
            "model": ProductCreationErrorResponse,
            "description": "Validation failed",
        },
        502: {
            "model": ProductCreationErrorResponse,
            "description": "Upstream creation failed",
        },
    },
)
async def create_products_from_file(
    file: UploadFile = File(
        ..., description="JSON file with one object or an array of objects"
    ),
    max_chars: int = Form(default=2000, ge=300, le=5000),
    creation_service: ProductCreationService = Depends(get_product_creation_service),
):
    """One-shot flow: upload file, normalize/validate, and create in OTTO."""
    if not file.filename or not file.filename.lower().endswith(".json"):
        return JSONResponse(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            content=ProductCreationErrorResponse(
                message="Only .json files are supported"
            ).model_dump(),
        )

    try:
        raw = await file.read()
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message=f"Unable to read uploaded file: {exc}"
            ).model_dump(),
        )

    if not raw:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message="Uploaded file is empty"
            ).model_dump(),
        )

    try:
        result = await creation_service.process_upload(raw, max_chars=max_chars)
    except ValueError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(message=str(exc)).model_dump(),
        )
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message=f"Unable to parse/process JSON: {exc}"
            ).model_dump(),
        )

    if result.normalized_items == 0:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ProductCreationErrorResponse(
                message="No valid products after normalization and validation",
                issues=result.issues,
            ).model_dump(),
        )

    if result.created_items == 0 or any(
        issue.stage == "create" for issue in result.issues
    ):
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=ProductCreationErrorResponse(
                message="Product creation failed for one or more items",
                issues=result.issues,
            ).model_dump(),
        )

    return ProductCreationFileResponse(
        success=True,
        source_items=result.source_items,
        normalized_items=result.normalized_items,
        created_items=result.created_items,
        skipped_items=result.skipped_items,
        issues=result.issues,
    )


@router.post(
    "/upload-xlsx",
    response_model=ProductSpreadsheetImportResponse,
    responses={
        400: {"model": ProductCreationErrorResponse, "description": "Invalid request"},
        415: {
            "model": ProductCreationErrorResponse,
            "description": "Unsupported media type",
        },
    },
)
async def upload_products(
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(..., description="XLSX file exported from OTTO market"),
):
    """Import selected XLSX columns into the local products table."""
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

    try:
        parsed_rows = _read_xlsx_rows(raw)
    except ValueError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(message=str(exc)).model_dump(),
        )
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ProductCreationErrorResponse(
                message=f"Could not parse XLSX file: {exc}"
            ).model_dump(),
        )

    rows, skipped_rows = _deduplicate_rows(parsed_rows)

    if not rows:
        return ProductSpreadsheetImportResponse(
            success=True,
            file_name=file.filename,
            imported_rows=0,
            upserted_rows=0,
            skipped_rows=skipped_rows,
            columns=list(XLSX_COLUMN_MAP.values()),
        )

    upserted_rows = await _upsert_products_in_batches(db, rows)

    return ProductSpreadsheetImportResponse(
        success=True,
        file_name=file.filename,
        imported_rows=len(parsed_rows),
        upserted_rows=upserted_rows,
        skipped_rows=skipped_rows,
        columns=list(XLSX_COLUMN_MAP.values()),
    )


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


@router.post(
    "/fetch-afterbuy-task",
    response_model=ProductImportTaskDTO,
)
async def create_afterbuy_fetch_task(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role([RoleEnum.SEO])),
    account: str = Query(default="JV"),
    dataset: str = Query(default="lister"),
    limit: int = Query(default=100000, ge=1, le=100000),
):
    """Create a background Afterbuy fetch task for the JV lister table."""
    task = ProductImportTask(
        id=str(uuid4()),
        file_name=f"Afterbuy {account} {dataset}",
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

    try:
        sync_afterbuy_jv_lister_task.delay(
            task_id=task.id,
            account=account,
            dataset=dataset,
            limit=limit,
        )
    except Exception as exc:
        task.status = "failed"
        task.error_message = f"Could not enqueue Celery task: {exc}"
        task.finished_at = datetime.utcnow()
        await db.commit()
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=ProductCreationErrorResponse(
                message="Could not enqueue Afterbuy fetch task",
            ).model_dump(),
        )
    return _task_to_dto(task)


@router.get("/db/{sku}")
@router.get("/{sku}", include_in_schema=False)
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


@router.get("/otto/{sku}")
async def get_otto_product(
    sku: str,
    product_service: ProductService = Depends(get_product_service),
):
    """Fetch one product directly from OTTO by SKU."""
    return await product_service.get_product(sku)


@router.post(
    "/tasks/create-from-factory", response_model=ProductFactoryCreateResponseDTO
)
async def create_product_task_from_factory(
    payload: ProductFactoryCreateRequestDTO,
    background_tasks: BackgroundTasks,
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
    product_service: ProductService = Depends(get_product_service),
):
    run_id = payload.run_id or str(uuid4())
    FACTORY_PREPARE_TASKS[run_id] = {
        "status": "IN_PROGRESS",
        "controller": payload.controller.value,
        "factory_id": payload.factory_id,
        "source_items": 0,
        "mapped_items": 0,
        "payload_items": 0,
        "issues": [],
        "products": [],
        "updated_at": datetime.now(UTC).isoformat(),
    }

    background_tasks.add_task(
        _run_factory_prepare_task,
        process_id=run_id,
        payload=payload,
        afterbuy=afterbuy,
        product_service=product_service,
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


@router.get("/tasks/create-from-factory/{process_id}")
async def get_factory_prepare_task(process_id: str):
    task = FACTORY_PREPARE_TASKS.get(process_id)
    if task is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "success": False,
                "message": "Task not found",
                "process_id": process_id,
            },
        )
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
        and isinstance(heartbeat_lag_sec, float)
        and heartbeat_lag_sec > FACTORY_STUCK_THRESHOLD_SEC
    ):
        is_stuck = True
        task["stuck"] = True
        task["stuck_message"] = (
            f"Step '{task.get('current_step')}' has no heartbeat for "
            f"{int(heartbeat_lag_sec)}s"
        )
        MAPPER_LOGGER.warning(
            "step=task_stuck_detected process_id=%s current_step=%s heartbeat_lag_sec=%s",
            process_id,
            task.get("current_step"),
            int(heartbeat_lag_sec),
        )

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


@router.post("/tasks/create-from-factory/{process_id}/submit")
async def submit_factory_prepared_products(
    process_id: str,
    payload: dict[str, Any],
    product_service: ProductService = Depends(get_product_service),
):
    task = FACTORY_PREPARE_TASKS.get(process_id)
    products = payload.get("products")
    if not isinstance(products, list) or not products:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "products must be a non-empty array"},
        )

    validated: list[dict[str, Any]] = []
    validated_models: list[ProductPayload] = []
    for index, item in enumerate(products):
        try:
            model = ProductPayload.model_validate(item)
            validated_models.append(model)
            validated.append(model.model_dump(mode="json", exclude_none=True))
        except Exception as exc:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "success": False,
                    "message": f"Invalid product at index {index}: {exc}",
                    "index": index,
                },
            )

    controller_value = str(
        (task or {}).get("controller")
        or payload.get("controller")
        or "jv"
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

    factory_id = str((task or {}).get("factory_id") or payload.get("factory_id") or "unknown")
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
            "products": validated,
            "created_at": datetime.now(UTC).isoformat(),
        }
        FACTORY_PREPARE_TASKS[process_id] = task
    task["final_snapshot_path"] = file_path.as_posix()
    task["final_products_count"] = len(validated)
    task["updated_at"] = datetime.now(UTC).isoformat()

    create_payload = CreateProductRequest(
        controller=controller,
        products=validated_models,
    )
    create_result = await product_service.create_or_update_products(create_payload)
    otto_process_id = _extract_process_id(create_result)
    otto_state = (create_result.state or "").lower()
    update_result: dict[str, Any] = {}
    failed_result: dict[str, Any] | None = None

    if otto_process_id:
        for _ in range(FACTORY_OTTO_UPDATE_TASK_MAX_POLLS):
            update_result = await product_service.update_tasks(
                otto_process_id, controller=controller
            )
            otto_state = str(update_result.get("state", "")).lower()
            if otto_state in {"done", "failed", "error"}:
                break

            ping_after_value = update_result.get("pingAfter")
            sleep_seconds = FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC
            if isinstance(ping_after_value, str):
                try:
                    ping_after = datetime.fromisoformat(
                        ping_after_value.replace("Z", "+00:00")
                    )
                    now = datetime.now(UTC)
                    delta = (ping_after - now).total_seconds()
                    sleep_seconds = max(
                        1,
                        min(FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC, int(delta) if delta > 0 else 1),
                    )
                except ValueError:
                    sleep_seconds = FACTORY_OTTO_UPDATE_TASK_FALLBACK_SLEEP_SEC
            await asyncio.sleep(sleep_seconds)

        failed_count = int(update_result.get("failed") or 0)
        if failed_count > 0:
            failed_result = await product_service.failed_tasks(
                otto_process_id, controller=controller
            )

    task["otto_process_id"] = otto_process_id
    task["otto_update_result"] = update_result
    task["otto_failed_result"] = failed_result
    task["updated_at"] = datetime.now(UTC).isoformat()
    task["status"] = "DONE" if int((update_result or {}).get("failed") or 0) == 0 else "FAILED"

    return {
        "success": True,
        "process_id": process_id,
        "saved_path": file_path.as_posix(),
        "products_count": len(validated),
        "otto_process_id": otto_process_id,
        "otto_create_state": otto_state,
        "otto_update_result": update_result,
        "otto_failed_result": failed_result,
    }


@router.delete("delete-by-url/product", response_model=DeleteProductResponse)
async def delete_by_url(
    skus: list[str],
    controller: Controller = Controller.JV,
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.delete_product_from_file(skus, controller)
