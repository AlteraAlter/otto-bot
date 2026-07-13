"""Fill missing OTTO attributes for products fetched directly from OTTO."""

from __future__ import annotations

import asyncio
import copy
from dataclasses import dataclass
from datetime import UTC, datetime
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import delete, func, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.arq_app import enqueue_jobs
from app.core.configs import settings
from app.core.logger import logging
from app.database import SessionLocal
from app.mapper.product_mapper import ProductMapper
from app.models.attribute_fill import AttributeFillChunk, AttributeFillItem
from app.models.attributes import Attribute
from app.models.categories import Category
from app.models.category_group import CategoryGroup
from app.models.variation_theme import VariationTheme
from app.normalize_product_to_schema import brand_id_for_controller
from app.services.factory_task_state_service import FactoryTaskStateService
from app.services.product_service import ProductService
from app.services.product_variation_logic import is_supported_variation_attribute

logger = logging.getLogger("product_mapper_flow")

ACTIVE_MARKETPLACE_STATUSES = {"ONLINE"}
ACTIVE_ACTIVE_STATUSES = {"TRUE", "ACTIVE", "AKTIV"}
DEFAULT_CONTROLLER = "xl"
OTTO_PAGE_SIZE = 100
OTTO_SUBMIT_BATCH_SIZE = 50
OTTO_FETCH_SLEEP_SECONDS = 0.25
OTTO_RATE_LIMIT_RETRIES = 5
ATTRIBUTE_FILL_CHUNK_SIZE = 50
ATTRIBUTE_FILL_AI_RETRIES = 5
ATTRIBUTE_FILL_AI_BASE_DELAY_SECONDS = 8.0
ATTRIBUTE_FILL_LOCK_SECONDS = 60
ATTRIBUTE_FILL_TASK_SERVICE = FactoryTaskStateService()


@dataclass(frozen=True)
class AttributeFillOptions:
    controller: str = DEFAULT_CONTROLLER


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _status_key(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return str(value or "").strip().upper()


def _as_list(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in (
        "productVariations",
        "products",
        "items",
        "results",
        "content",
        "data",
        "statuses",
        "status",
        "activeStatus",
        "marketPlaceStatus",
        "marketplaceStatus",
    ):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def _has_next_page(payload: Any) -> bool | None:
    if not isinstance(payload, dict):
        return None
    links = payload.get("links")
    if not isinstance(links, list):
        return None
    return any(
        isinstance(link, dict) and str(link.get("rel") or "").casefold() == "next"
        for link in links
    )


def _media_shape(product: dict[str, Any]) -> dict[str, Any]:
    shape: dict[str, Any] = {}
    for key in ("mediaAssets", "media"):
        value = product.get(key)
        item_shape = None
        if isinstance(value, list) and value:
            first = value[0]
            item_shape = (
                sorted(first.keys())
                if isinstance(first, dict)
                else type(first).__name__
            )
        shape[key] = {
            "type": type(value).__name__,
            "count": len(value) if isinstance(value, list) else None,
            "firstItem": item_shape,
        }
    return shape


def _attribute_fill_api_keys() -> list[str]:
    raw_keys = settings.openai_attribute_fill_api_keys or ""
    keys = [
        item.strip()
        for item in raw_keys.replace("\n", ",").split(",")
        if item.strip()
    ]
    return keys or [settings.gpt_key]


def _ai_key_slot_for_chunk(chunk_id: int, key_count: int) -> int:
    return (max(1, chunk_id) - 1) % max(1, key_count)


def _ai_key_for_slot(slot: int) -> str:
    keys = _attribute_fill_api_keys()
    return keys[slot % len(keys)]


def _masked_key_label(slot: int) -> str:
    key = _ai_key_for_slot(slot)
    return f"slot={slot} key=...{key[-4:]}" if len(key) >= 4 else f"slot={slot}"


@asynccontextmanager
async def _task_state_lock(process_id: str):
    redis_client = await ATTRIBUTE_FILL_TASK_SERVICE._get_redis()
    if redis_client is None:
        yield
        return

    key = f"attribute-fill-lock:{process_id}"
    token = uuid4().hex
    while True:
        acquired = await redis_client.set(
            key,
            token,
            ex=ATTRIBUTE_FILL_LOCK_SECONDS,
            nx=True,
        )
        if acquired:
            break
        await asyncio.sleep(0.1)

    try:
        yield
    finally:
        current = await redis_client.get(key)
        if current == token:
            await redis_client.delete(key)


async def _mutate_task_state(
    process_id: str,
    mutator,
    *,
    created_by_user_id: int | None = None,
) -> dict[str, Any]:
    async with _task_state_lock(process_id):
        task = await ATTRIBUTE_FILL_TASK_SERVICE.get_task(process_id) or {}
        mutator(task)
        return await ATTRIBUTE_FILL_TASK_SERVICE.save_task(
            process_id,
            task,
            created_by_user_id=created_by_user_id,
        )


def _extract_total(payload: Any) -> int | None:
    if not isinstance(payload, dict):
        return None
    for key in ("total", "totalElements", "totalCount", "count"):
        try:
            value = int(payload.get(key))
        except (TypeError, ValueError):
            continue
        if value >= 0:
            return value
    return None


def _sku_from_item(item: Any) -> str | None:
    if not isinstance(item, dict):
        return None
    for key in ("sku", "SKU", "productSku"):
        value = _clean_text(item.get(key))
        if value:
            return value
    product = item.get("product")
    if isinstance(product, dict):
        return _sku_from_item(product)
    return None


def _status_from_item(item: Any, keys: tuple[str, ...]) -> Any:
    if not isinstance(item, dict):
        return None
    for key in keys:
        if key in item:
            return item.get(key)
    nested = item.get("status")
    if isinstance(nested, dict):
        return _status_from_item(nested, keys)
    return None


def _category_from_product(product: dict[str, Any]) -> str | None:
    description = product.get("productDescription")
    if isinstance(description, dict):
        category = _clean_text(description.get("category"))
        if category:
            return category
    for key in ("category", "productCategory"):
        category = _clean_text(product.get(key))
        if category:
            return category
    return None


def _product_summary(
    product: dict[str, Any],
    *,
    marketplace_status: Any = None,
    active_status: Any = None,
) -> dict[str, Any]:
    return {
        "sku": _sku_from_item(product),
        "ean": _clean_text(product.get("ean")),
        "productReference": _clean_text(product.get("productReference")),
        "productCategory": _category_from_product(product),
        "marketplaceStatus": marketplace_status
        if marketplace_status is not None
        else product.get("marketplaceStatus"),
        "activeStatus": active_status
        if active_status is not None
        else product.get("activeStatus"),
    }


def _attribute_payload(attr: Attribute) -> dict[str, Any]:
    return {
        "id": attr.id,
        "attributeId": attr.id,
        "name": attr.name,
        "description": attr.description,
        "type": attr.type,
        "attributeGroup": attr.attribute_group,
        "multiValue": attr.multi_value,
        "relevance": attr.relevance,
        "featureRelevance": list(attr.feature_relevance or []),
        "unit": attr.unit,
        "unitDisplayName": attr.unit_display_name,
        "allowedValues": [
            item.value
            for item in sorted(
                attr.allowed_values,
                key=lambda item: str(item.value or "").casefold(),
            )
            if item.value
        ],
    }


def _is_relevant_category_attribute(
    attr: Attribute,
    *,
    is_variation_theme: bool = False,
) -> bool:
    """Return the compact attribute set worth sending to AI for missing-fill."""

    feature_relevance = {
        str(value).strip().upper() for value in (attr.feature_relevance or [])
    }
    return (
        str(attr.relevance or "").upper() == "HIGH"
        or bool(feature_relevance & {"LEGAL", "MANDATORY", "REQUIRED"})
        or is_variation_theme
    )


def _is_variation_category_attribute(
    attr: Attribute,
    variation_attribute_ids: set[int],
) -> bool:
    upstream_variation = attr.id in variation_attribute_ids or "VARIATION_THEME" in {
        str(value).strip().upper() for value in (attr.feature_relevance or [])
    }
    return upstream_variation and is_supported_variation_attribute(attr.name)


def _append_task_item(task: dict[str, Any], key: str, item: dict[str, Any], limit: int = 100) -> None:
    items = task.get(key)
    if not isinstance(items, list):
        items = []
    items.append(item)
    task[key] = items[-limit:]


def _existing_attributes(product: dict[str, Any]) -> list[dict[str, Any]]:
    description = product.get("productDescription")
    if not isinstance(description, dict):
        return []
    attrs = description.get("attributes")
    return [item for item in attrs if isinstance(item, dict)] if isinstance(attrs, list) else []


def _existing_attribute_names(product: dict[str, Any]) -> set[str]:
    return {
        name.casefold()
        for item in _existing_attributes(product)
        if (name := _clean_text(item.get("name")))
        and _attribute_has_value(item)
    }


def _attribute_has_value(item: dict[str, Any]) -> bool:
    raw_values = item.get("values", item.get("value"))
    if isinstance(raw_values, list):
        return any(_clean_text(value) for value in raw_values)
    return _clean_text(raw_values) is not None


def _bullet_points(product: dict[str, Any]) -> list[str]:
    description = product.get("productDescription")
    if not isinstance(description, dict):
        return []
    raw = description.get("bulletPoints")
    if not isinstance(raw, list):
        return []
    return [text for item in raw if (text := _clean_text(item))]


def _source_from_otto_product(product: dict[str, Any]) -> dict[str, Any]:
    description = product.get("productDescription")
    description = description if isinstance(description, dict) else {}
    source: dict[str, Any] = {
        "Artikelbeschreibung": description.get("productLine")
        or product.get("productLine")
        or product.get("productReference")
        or product.get("sku"),
        "EAN": product.get("ean"),
        "SKU": product.get("sku"),
        "Produktkategorie": description.get("category"),
        "Beschreibung": description.get("description"),
        "Description": description.get("description"),
        "mediaAssets": product.get("mediaAssets"),
        "imageUrls": product.get("mediaAssets"),
    }
    for attr in _existing_attributes(product):
        name = _clean_text(attr.get("name"))
        if not name:
            continue
        raw_values = attr.get("values", attr.get("value"))
        if isinstance(raw_values, list):
            values = [value for value in raw_values if _clean_text(value)]
            if values:
                source[name] = values[0] if len(values) == 1 else values
        elif _clean_text(raw_values):
            source[name] = raw_values
    return {key: value for key, value in source.items() if value not in (None, "", [])}


def _new_attribute_rows(
    *,
    attributes: list[dict[str, Any]],
    existing_names: set[str],
    allowed_names: set[str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for attr in attributes:
        name = _clean_text(attr.get("name"))
        values = attr.get("values")
        if not name or not isinstance(values, list):
            continue
        if name.casefold() in existing_names:
            continue
        if allowed_names and name.casefold() not in allowed_names:
            continue
        cleaned_values = [value for value in (_clean_text(item) for item in values) if value]
        unique_values: list[str] = []
        for value in cleaned_values:
            key = (name.casefold(), value.casefold())
            if key in seen:
                continue
            seen.add(key)
            unique_values.append(value)
        if unique_values:
            rows.append({"name": name, "values": unique_values, "additional": True})
    return rows


def _merge_attributes(
    product: dict[str, Any],
    new_attrs: list[dict[str, Any]],
    *,
    controller: str,
) -> dict[str, Any]:
    next_product = copy.deepcopy(product)
    next_product.pop("_attributeFillActiveStatus", None)
    next_product.pop("_attributeFillMarketplaceStatus", None)
    allowed_top_level = {
        "productReference",
        "sku",
        "ean",
        "productDescription",
        "mediaAssets",
        "pricing",
        "logistics",
        "order",
        "compliance",
    }
    next_product = {
        key: value
        for key, value in next_product.items()
        if key in allowed_top_level and value is not None
    }
    description = next_product.setdefault("productDescription", {})
    if not isinstance(description, dict):
        description = {}
        next_product["productDescription"] = description
    description.setdefault("brandId", brand_id_for_controller(controller))
    existing = description.get("attributes")
    if not isinstance(existing, list):
        existing = []
    description["attributes"] = [*existing, *new_attrs]
    return next_product


async def _load_category_attributes(
    session: AsyncSession,
    product_category: str | None,
) -> tuple[str | None, list[dict[str, Any]]]:
    category = _clean_text(product_category)
    if not category:
        return None, []

    normalized = category.casefold()
    stmt = (
        select(CategoryGroup)
        .outerjoin(Category, Category.group_id == CategoryGroup.id)
        .options(
            selectinload(CategoryGroup.attributes).selectinload(
                Attribute.allowed_values
            )
        )
        .where(
            or_(
                func.lower(func.trim(CategoryGroup.name)) == normalized,
                func.lower(func.trim(Category.name)) == normalized,
            )
        )
        .order_by(CategoryGroup.name.asc())
        .limit(1)
    )
    group = (await session.scalars(stmt)).unique().first()
    if group is None:
        return None, []

    variation_attribute_ids = {
        attribute_id
        for (attribute_id,) in (
            await session.execute(
                select(VariationTheme.attribute_id).where(
                    VariationTheme.group_id == group.id
                )
            )
        ).all()
    }
    attrs: list[dict[str, Any]] = []
    total_attributes = 0
    for attr in sorted(group.attributes, key=lambda item: item.name.casefold()):
        if not attr.name or not attr.type:
            continue
        total_attributes += 1
        is_variation_theme = _is_variation_category_attribute(
            attr,
            variation_attribute_ids,
        )
        if not _is_relevant_category_attribute(
            attr,
            is_variation_theme=is_variation_theme,
        ):
            continue
        payload = _attribute_payload(attr)
        payload["isVariationTheme"] = is_variation_theme
        attrs.append(payload)
    logger.info(
        "step=attribute_fill_category_attrs_loaded category=%s group=%s total_attrs=%s relevant_attrs=%s variation_attrs=%s",
        product_category,
        group.name,
        total_attributes,
        len(attrs),
        len(variation_attribute_ids),
    )
    return group.name, attrs


async def _fetch_all_pages(
    fetch_page,
    *,
    label: str,
    page_size: int = OTTO_PAGE_SIZE,
    progress_callback=None,
) -> tuple[list[dict[str, Any]], int | None]:
    items: list[dict[str, Any]] = []
    total: int | None = None
    page = 0
    while True:
        logger.info("step=attribute_fill_fetch_page_start label=%s page=%s", label, page)
        for attempt in range(OTTO_RATE_LIMIT_RETRIES + 1):
            try:
                payload = await fetch_page({"page": page, "limit": page_size})
                break
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response else None
                if status_code != 429 or attempt >= OTTO_RATE_LIMIT_RETRIES:
                    raise
                retry_after = exc.response.headers.get("retry-after")
                try:
                    sleep_seconds = float(retry_after) if retry_after else None
                except (TypeError, ValueError):
                    sleep_seconds = None
                if sleep_seconds is None:
                    sleep_seconds = min(30.0, 2.0 * (attempt + 1))
                logger.warning(
                    "step=attribute_fill_fetch_rate_limited label=%s page=%s attempt=%s sleep_seconds=%s",
                    label,
                    page,
                    attempt + 1,
                    sleep_seconds,
                )
                await asyncio.sleep(sleep_seconds)
        if total is None:
            total = _extract_total(payload)
        page_items = [item for item in _as_list(payload) if isinstance(item, dict)]
        items.extend(page_items)
        has_next_page = _has_next_page(payload)
        logger.info(
            "step=attribute_fill_fetch_page_done label=%s page=%s page_items=%s fetched=%s total=%s has_next=%s",
            label,
            page,
            len(page_items),
            len(items),
            total,
            has_next_page,
        )
        if progress_callback is not None:
            await progress_callback(
                label=label,
                page=page,
                page_items=len(page_items),
                fetched=len(items),
                total=total,
            )
        if not page_items:
            break
        if has_next_page is False:
            break
        if total is not None and len(items) >= total:
            break
        if has_next_page is None and len(page_items) < page_size:
            break
        page += 1
        await asyncio.sleep(OTTO_FETCH_SLEEP_SECONDS)
    return items, total


async def _fetch_otto_products_and_statuses(
    product_service: ProductService,
    *,
    controller: str,
    progress_callback=None,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any], dict[str, Any]]:
    products, total = await _fetch_all_pages(
        lambda params: product_service.client.get_products_raw(
            params,
            controller=controller,
        ),
        label="products",
        progress_callback=progress_callback,
    )
    active_rows, active_total = await _fetch_all_pages(
        lambda params: product_service.get_active_products(
            params,
            controller=controller,
        ),
        label="active_status",
        progress_callback=progress_callback,
    )
    marketplace_rows, marketplace_total = await _fetch_all_pages(
        lambda params: product_service.get_marketplace_status(
            params,
            controller=controller,
        ),
        label="marketplace_status",
        progress_callback=progress_callback,
    )

    active_by_sku: dict[str, Any] = {}
    for row in active_rows:
        sku = _sku_from_item(row)
        if not sku:
            continue
        active_by_sku[sku] = _status_from_item(
            row,
            ("active", "activeStatus", "status", "isActive"),
        )

    marketplace_by_sku: dict[str, Any] = {}
    for row in marketplace_rows:
        sku = _sku_from_item(row)
        if not sku:
            continue
        marketplace_by_sku[sku] = _status_from_item(
            row,
            ("marketplaceStatus", "status", "state", "publicationStatus"),
        )

    meta = {
        "otto_products_total": total,
        "otto_products_fetched": len(products),
        "active_status_total": active_total,
        "active_status_fetched": len(active_rows),
        "marketplace_status_total": marketplace_total,
        "marketplace_status_fetched": len(marketplace_rows),
    }
    logger.info(
        "step=attribute_fill_fetch_done controller=%s products=%s active_rows=%s marketplace_rows=%s",
        controller,
        len(products),
        len(active_rows),
        len(marketplace_rows),
    )
    return products, active_by_sku, marketplace_by_sku, meta


def _active_status_map(rows: list[dict[str, Any]]) -> dict[str, Any]:
    statuses: dict[str, Any] = {}
    for row in rows:
        sku = _sku_from_item(row)
        if not sku:
            continue
        statuses[sku] = _status_from_item(
            row,
            ("active", "activeStatus", "status", "isActive"),
        )
    return statuses


def _marketplace_status_map(rows: list[dict[str, Any]]) -> dict[str, Any]:
    statuses: dict[str, Any] = {}
    for row in rows:
        sku = _sku_from_item(row)
        if not sku:
            continue
        statuses[sku] = _status_from_item(
            row,
            ("marketplaceStatus", "status", "state", "publicationStatus"),
        )
    return statuses


async def _prepare_attribute_fill_tables(
    *,
    process_id: str,
    products: list[dict[str, Any]],
    active_by_sku: dict[str, Any],
    marketplace_by_sku: dict[str, Any],
    chunk_size: int = ATTRIBUTE_FILL_CHUNK_SIZE,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    key_count = len(_attribute_fill_api_keys())
    item_rows: list[dict[str, Any]] = []
    chunk_counts: dict[int, int] = {}
    status_feed: list[dict[str, Any]] = []
    counts = {
        "status_checked_products": 0,
        "active_products_count": 0,
        "inactive_products_count": 0,
        "missing_status_products_count": 0,
    }
    active_index = 0

    for product in products:
        sku = _sku_from_item(product)
        if not sku:
            continue
        counts["status_checked_products"] += 1
        active_status = active_by_sku.get(sku, product.get("activeStatus"))
        marketplace_status = marketplace_by_sku.get(sku, product.get("marketplaceStatus"))
        is_active = (
            _status_key(active_status) in ACTIVE_ACTIVE_STATUSES
            and _status_key(marketplace_status) in ACTIVE_MARKETPLACE_STATUSES
        )
        if active_status is None or marketplace_status is None:
            counts["missing_status_products_count"] += 1

        chunk_id: int | None = None
        ai_key_slot: int | None = None
        row_status = "inactive"
        raw_product = copy.deepcopy(product)
        if is_active:
            active_index += 1
            chunk_id = ((active_index - 1) // max(1, chunk_size)) + 1
            ai_key_slot = _ai_key_slot_for_chunk(chunk_id, key_count)
            chunk_counts[chunk_id] = chunk_counts.get(chunk_id, 0) + 1
            row_status = "queued"
            counts["active_products_count"] += 1
            raw_product["_attributeFillActiveStatus"] = active_status
            raw_product["_attributeFillMarketplaceStatus"] = marketplace_status
        else:
            counts["inactive_products_count"] += 1

        if len(status_feed) < 200:
            status_feed.append(
                {
                    "sku": sku,
                    "ean": _clean_text(product.get("ean")),
                    "activeStatus": active_status,
                    "marketplaceStatus": marketplace_status,
                    "isActive": is_active,
                    "chunkId": chunk_id,
                    "aiKeySlot": ai_key_slot,
                }
            )

        item_rows.append(
            {
                "process_id": process_id,
                "chunk_id": chunk_id,
                "ai_key_slot": ai_key_slot,
                "sku": sku,
                "ean": _clean_text(product.get("ean")),
                "product_reference": _clean_text(product.get("productReference")),
                "product_category": _category_from_product(product),
                "active_status": active_status,
                "marketplace_status": marketplace_status,
                "is_active": is_active,
                "status": row_status,
                "raw_product": raw_product,
                "attributes_added": 0,
            }
        )

    chunks = [
        {
            "chunk_id": chunk_id,
            "product_count": product_count,
            "ai_key_slot": _ai_key_slot_for_chunk(chunk_id, key_count),
        }
        for chunk_id, product_count in sorted(chunk_counts.items())
    ]

    async with SessionLocal() as session:
        await session.execute(
            delete(AttributeFillItem).where(AttributeFillItem.process_id == process_id)
        )
        await session.execute(
            delete(AttributeFillChunk).where(AttributeFillChunk.process_id == process_id)
        )
        await session.flush()
        for start in range(0, len(item_rows), 1000):
            await session.execute(insert(AttributeFillItem), item_rows[start : start + 1000])
        if chunks:
            await session.execute(
                insert(AttributeFillChunk),
                [
                    {
                        "process_id": process_id,
                        "chunk_id": chunk["chunk_id"],
                        "ai_key_slot": chunk["ai_key_slot"],
                        "status": "queued",
                        "product_count": chunk["product_count"],
                        "processed_count": 0,
                        "updated_count": 0,
                        "skipped_count": 0,
                        "failed_count": 0,
                        "generated_attributes": 0,
                    }
                    for chunk in chunks
                ],
            )
        await session.commit()

    logger.info(
        "step=attribute_fill_tables_prepared process_id=%s total_items=%s active_items=%s chunks=%s key_slots=%s",
        process_id,
        len(item_rows),
        counts["active_products_count"],
        len(chunks),
        key_count,
    )
    return chunks, status_feed, counts


def _active_products(
    products: list[dict[str, Any]],
    active_by_sku: dict[str, Any],
    marketplace_by_sku: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    result: list[dict[str, Any]] = []
    status_feed: list[dict[str, Any]] = []
    counts = {
        "status_checked_products": 0,
        "active_products_count": 0,
        "inactive_products_count": 0,
        "missing_status_products_count": 0,
    }
    for product in products:
        sku = _sku_from_item(product)
        if not sku:
            continue
        counts["status_checked_products"] += 1
        active_status = active_by_sku.get(sku, product.get("activeStatus"))
        marketplace_status = marketplace_by_sku.get(sku, product.get("marketplaceStatus"))
        is_active = (
            _status_key(active_status) in ACTIVE_ACTIVE_STATUSES
            and _status_key(marketplace_status) in ACTIVE_MARKETPLACE_STATUSES
        )
        if active_status is None or marketplace_status is None:
            counts["missing_status_products_count"] += 1
        if is_active:
            counts["active_products_count"] += 1
            product["_attributeFillActiveStatus"] = active_status
            product["_attributeFillMarketplaceStatus"] = marketplace_status
            result.append(product)
        else:
            counts["inactive_products_count"] += 1
        if len(status_feed) < 200:
            status_feed.append(
                {
                    "sku": sku,
                    "ean": _clean_text(product.get("ean")),
                    "activeStatus": active_status,
                    "marketplaceStatus": marketplace_status,
                    "isActive": is_active,
                }
            )
    return result, status_feed, counts


async def create_attribute_fill_task_state(
    *,
    process_id: str,
    options: AttributeFillOptions,
    created_by_user_id: int | None = None,
) -> dict[str, Any]:
    now = _utc_now()
    task = {
        "task_type": "attribute_fill",
        "status": "IN_PROGRESS",
        "current_step": "attribute_fill_queued",
        "current_step_started_at": now,
        "updated_at": now,
        "heartbeat_at": now,
        "progress_total": 0,
        "progress_completed": 0,
        "progress_percent": 0,
        "controller": options.controller,
        "selected_products": 0,
        "processed_products": 0,
        "updated_products": 0,
        "skipped_products": 0,
        "failed_products": 0,
        "generated_attributes": 0,
        "chunks_total": 0,
        "chunks_queued": 0,
        "chunks_started": 0,
        "chunks_completed": 0,
        "chunks_failed": 0,
        "completed_products": [],
        "current_action": "Queued",
        "fetch_progress": {},
        "status_feed": [],
        "ai_feed": [],
        "chunk_feed": [],
        "issues": [],
    }
    return await ATTRIBUTE_FILL_TASK_SERVICE.save_task(
        process_id,
        task,
        created_by_user_id=created_by_user_id,
    )


async def _submit_batch(
    product_service: ProductService,
    *,
    controller: str,
    products: list[dict[str, Any]],
) -> None:
    for start in range(0, len(products), OTTO_SUBMIT_BATCH_SIZE):
        batch = products[start : start + OTTO_SUBMIT_BATCH_SIZE]
        logger.info(
            "step=attribute_fill_submit_batch_start controller=%s batch_start=%s batch_size=%s",
            controller,
            start,
            len(batch),
        )
        await product_service.client.create_or_update_products_raw(
            batch,
            controller=controller,
        )
        logger.info(
            "step=attribute_fill_submit_batch_done controller=%s batch_start=%s batch_size=%s",
            controller,
            start,
            len(batch),
        )


def _is_retryable_ai_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code in {429, 500, 502, 503, 504}:
        return True
    message = str(exc).casefold()
    return any(
        token in message
        for token in (
            "rate limit",
            "too many requests",
            "timeout",
            "temporarily unavailable",
            "server error",
        )
    )


async def _generate_attributes_with_retries(
    mapper: ProductMapper,
    *,
    process_id: str,
    chunk_id: int,
    sku: str,
    category: str,
    source_attributes: dict[str, Any],
    bullet_points: list[str],
    otto_attributes: list[dict[str, Any]],
    exclude_attributes: list[dict[str, Any]],
    image_urls: list[str],
) -> dict[str, Any]:
    for attempt in range(ATTRIBUTE_FILL_AI_RETRIES + 1):
        try:
            return await mapper.attribute_generator.generate(
                category=category,
                source_attributes=source_attributes,
                bullet_points=bullet_points,
                otto_attributes=otto_attributes,
                exclude_attributes=exclude_attributes,
                image_urls=image_urls,
            )
        except Exception as exc:
            if attempt >= ATTRIBUTE_FILL_AI_RETRIES or not _is_retryable_ai_error(exc):
                raise
            sleep_seconds = min(
                180.0,
                ATTRIBUTE_FILL_AI_BASE_DELAY_SECONDS * (2**attempt),
            )
            logger.warning(
                "step=attribute_fill_ai_retry process_id=%s chunk_id=%s sku=%s attempt=%s sleep_seconds=%s error=%s",
                process_id,
                chunk_id,
                sku,
                attempt + 1,
                sleep_seconds,
                exc,
            )
            await asyncio.sleep(sleep_seconds)
    raise RuntimeError("AI attribute generation failed after retries")


async def _load_category_attributes_cached(
    cache: dict[str, tuple[str | None, list[dict[str, Any]]]],
    product_category: str | None,
) -> tuple[str | None, list[dict[str, Any]]]:
    cache_key = str(product_category or "").strip().casefold()
    if cache_key in cache:
        return cache[cache_key]
    async with SessionLocal() as session:
        value = await _load_category_attributes(session, product_category)
    cache[cache_key] = value
    return value


async def _process_attribute_product(
    *,
    process_id: str,
    chunk_id: int,
    product: dict[str, Any],
    mapper: ProductMapper,
    controller: str,
    local_index: int,
    chunk_total: int,
    category_cache: dict[str, tuple[str | None, list[dict[str, Any]]]],
    created_by_user_id: int | None,
) -> tuple[dict[str, Any], dict[str, Any] | None, int]:
    sku = _sku_from_item(product)
    if not sku:
        raise ValueError("OTTO product has no SKU")

    product_summary = _product_summary(
        product,
        active_status=product.get("_attributeFillActiveStatus"),
        marketplace_status=product.get("_attributeFillMarketplaceStatus"),
    )
    category = _category_from_product(product)
    category_group, otto_attrs = await _load_category_attributes_cached(
        category_cache,
        category,
    )

    existing_names = _existing_attribute_names(product)
    missing_otto_attrs = [
        item
        for item in otto_attrs
        if str(item.get("name") or "").strip().casefold() not in existing_names
    ]
    if not otto_attrs:
        product_summary.update(
            {
                "status": "skipped",
                "reason": "category_attributes_not_found",
                "categoryGroup": category_group,
                "attributesAdded": 0,
            }
        )
        return product_summary, None, 0
    if not missing_otto_attrs:
        product_summary.update(
            {
                "status": "skipped",
                "reason": "no_missing_attributes",
                "categoryGroup": category_group,
                "attributesAdded": 0,
            }
        )
        return product_summary, None, 0

    source = _source_from_otto_product(product)
    compact_source = ProductMapper._prepare_ai_source(
        source,
        include_descriptions=False,
        include_images=True,
    )
    direct_map = [
        item
        for item in mapper.direct_map_attrs(compact_source)
        if str(item.get("name") or "").strip().casefold() not in existing_names
    ]
    ai_started_at = _utc_now()

    def mark_ai_start(task: dict[str, Any]) -> None:
        task["current_step"] = "attribute_fill_chunks_running"
        task["current_action"] = (
            f"Chunk {chunk_id}: AI {local_index}/{chunk_total} sku={sku} "
            f"missing={len(missing_otto_attrs)}"
        )
        task["updated_at"] = ai_started_at
        task["heartbeat_at"] = ai_started_at
        _append_task_item(
            task,
            "ai_feed",
            {
                "sku": sku,
                "stage": "ai_start",
                "chunkId": chunk_id,
                "category": category,
                "categoryGroup": category_group,
                "missingAttributes": len(missing_otto_attrs),
                "existingAttributes": len(existing_names),
                "at": ai_started_at,
            },
            limit=200,
        )

    await _mutate_task_state(
        process_id,
        mark_ai_start,
        created_by_user_id=created_by_user_id,
    )
    logger.info(
        "step=attribute_fill_ai_start process_id=%s chunk_id=%s local_index=%s chunk_total=%s sku=%s missing_attrs=%s existing_attrs=%s",
        process_id,
        chunk_id,
        local_index,
        chunk_total,
        sku,
        len(missing_otto_attrs),
        len(existing_names),
    )

    generated = await _generate_attributes_with_retries(
        mapper,
        process_id=process_id,
        chunk_id=chunk_id,
        sku=sku,
        category=str(category or category_group or ""),
        source_attributes=compact_source,
        bullet_points=_bullet_points(product),
        otto_attributes=missing_otto_attrs,
        exclude_attributes=[
            *_existing_attributes(product),
            *direct_map,
        ],
        image_urls=ProductMapper._extract_image_urls(compact_source),
    )
    generated_attrs = ProductMapper._shape_generated_attributes(
        generated.get("attributes", []) or []
    )
    all_attrs = ProductMapper._autofill_color_attributes(
        [*direct_map, *generated_attrs],
        missing_otto_attrs,
        compact_source.get("Farbe"),
    )
    new_attrs = _new_attribute_rows(
        attributes=all_attrs,
        existing_names=existing_names,
        allowed_names={
            str(item.get("name") or "").strip().casefold()
            for item in missing_otto_attrs
            if str(item.get("name") or "").strip()
        },
    )
    product_summary.update(
        {
            "status": "done" if new_attrs else "skipped",
            "reason": None if new_attrs else "ai_returned_no_supported_values",
            "categoryGroup": category_group,
            "attributesAdded": len(new_attrs),
            "attributeNames": sorted({item["name"] for item in new_attrs}),
        }
    )
    ai_done_at = _utc_now()

    def mark_ai_done(task: dict[str, Any]) -> None:
        _append_task_item(
            task,
            "ai_feed",
            {
                "sku": sku,
                "stage": "ai_done",
                "chunkId": chunk_id,
                "generatedAttributes": len(generated_attrs),
                "acceptedAttributes": len(new_attrs),
                "attributeNames": sorted({item["name"] for item in new_attrs}),
                "at": ai_done_at,
            },
            limit=200,
        )
        task["updated_at"] = ai_done_at
        task["heartbeat_at"] = ai_done_at

    await _mutate_task_state(
        process_id,
        mark_ai_done,
        created_by_user_id=created_by_user_id,
    )
    logger.info(
        "step=attribute_fill_ai_done process_id=%s chunk_id=%s local_index=%s chunk_total=%s sku=%s generated_attrs=%s accepted_attrs=%s",
        process_id,
        chunk_id,
        local_index,
        chunk_total,
        sku,
        len(generated_attrs),
        len(new_attrs),
    )

    if not new_attrs:
        return product_summary, None, 0

    submit_product = _merge_attributes(
        product,
        new_attrs,
        controller=controller,
    )
    logger.info(
        "step=attribute_fill_media_trace process_id=%s chunk_id=%s sku=%s incoming_media=%s outgoing_media=%s",
        process_id,
        chunk_id,
        sku,
        _media_shape(product),
        _media_shape(submit_product),
    )
    return product_summary, submit_product, len(new_attrs)


async def run_attribute_fill_task(
    *,
    process_id: str,
    product_service: ProductService,
    controller: str = DEFAULT_CONTROLLER,
    created_by_user_id: int | None = None,
) -> dict[str, Any]:
    """Coordinate OTTO fetching, active filtering, chunk persistence, and fan-out."""

    options = AttributeFillOptions(controller=_clean_text(controller) or DEFAULT_CONTROLLER)
    task = await ATTRIBUTE_FILL_TASK_SERVICE.get_task(process_id)
    if task is None:
        task = await create_attribute_fill_task_state(
            process_id=process_id,
            options=options,
            created_by_user_id=created_by_user_id,
        )

    now = _utc_now()
    task.update(
        {
            "status": "IN_PROGRESS",
            "current_step": "attribute_fill_fetching_otto",
            "current_step_started_at": now,
            "updated_at": now,
            "heartbeat_at": now,
            "progress_total": 0,
            "progress_completed": 0,
            "progress_percent": 0,
            "chunks_total": 0,
            "chunks_queued": 0,
            "chunks_started": 0,
            "chunks_completed": 0,
            "chunks_failed": 0,
            "current_action": "Fetching OTTO XL products and statuses",
        }
    )
    await ATTRIBUTE_FILL_TASK_SERVICE.save_task(
        process_id,
        task,
        created_by_user_id=created_by_user_id,
    )

    async def _fetch_progress(**progress: Any) -> None:
        label = str(progress.get("label") or "unknown")

        def update(task_state: dict[str, Any]) -> None:
            fetch_progress = (
                dict(task_state.get("fetch_progress"))
                if isinstance(task_state.get("fetch_progress"), dict)
                else {}
            )
            fetch_progress[label] = {
                "page": progress.get("page"),
                "page_items": progress.get("page_items"),
                "fetched": progress.get("fetched"),
                "total": progress.get("total"),
            }
            now_progress = _utc_now()
            task_state["fetch_progress"] = fetch_progress
            task_state["current_action"] = (
                f"Fetching {label}: {progress.get('fetched')}"
                f"/{progress.get('total') or '?'}"
            )
            task_state["updated_at"] = now_progress
            task_state["heartbeat_at"] = now_progress

        await _mutate_task_state(
            process_id,
            update,
            created_by_user_id=created_by_user_id,
        )

    try:
        products, active_by_sku, marketplace_by_sku, fetch_meta = (
            await _fetch_otto_products_and_statuses(
                product_service,
                controller=options.controller,
                progress_callback=_fetch_progress,
            )
        )
    except Exception as exc:
        logger.exception(
            "step=attribute_fill_fetch_failed process_id=%s controller=%s error=%s",
            process_id,
            options.controller,
            exc,
        )
        failed_at = _utc_now()

        def mark_failed(task_state: dict[str, Any]) -> None:
            task_state.update(
                {
                    "status": "FAILED",
                    "current_step": "attribute_fill_fetch_failed",
                    "current_step_started_at": failed_at,
                    "updated_at": failed_at,
                    "heartbeat_at": failed_at,
                    "finished_at": failed_at,
                    "current_action": f"OTTO fetch failed: {exc}",
                    "progress_percent": 0,
                }
            )
            _append_task_item(
                task_state,
                "issues",
                {"message": f"OTTO fetch failed: {exc}", "at": failed_at},
                limit=100,
            )

        return await _mutate_task_state(
            process_id,
            mark_failed,
            created_by_user_id=created_by_user_id,
        )

    chunks, status_feed, status_counts = await _prepare_attribute_fill_tables(
        process_id=process_id,
        products=products,
        active_by_sku=active_by_sku,
        marketplace_by_sku=marketplace_by_sku,
    )
    logger.info(
        "step=attribute_fill_chunks_prepared process_id=%s controller=%s fetched_products=%s active_products=%s chunks=%s inactive_products=%s missing_status=%s chunk_dir=%s",
        process_id,
        options.controller,
        len(products),
        status_counts["active_products_count"],
        len(chunks),
        status_counts["inactive_products_count"],
        status_counts["missing_status_products_count"],
        "db",
    )

    queued_at = _utc_now()

    def mark_queued(task_state: dict[str, Any]) -> None:
        task_state.update(
            {
                "current_step": "attribute_fill_chunks_queued",
                "current_step_started_at": queued_at,
                "updated_at": queued_at,
                "heartbeat_at": queued_at,
                "fetch_meta": {
                    **fetch_meta,
                    "chunk_size": ATTRIBUTE_FILL_CHUNK_SIZE,
                    "storage": "db",
                },
                "status_feed": status_feed,
                **status_counts,
                "progress_total": status_counts["active_products_count"],
                "progress_completed": 0,
                "progress_percent": 0,
                "selected_products": status_counts["active_products_count"],
                "processed_products": 0,
                "updated_products": 0,
                "skipped_products": 0,
                "failed_products": 0,
                "generated_attributes": 0,
                "chunks_total": len(chunks),
                "chunks_queued": len(chunks),
                "chunks_started": 0,
                "chunks_completed": 0,
                "chunks_failed": 0,
                "chunk_feed": [],
                "current_action": (
                    f"Queued {len(chunks)} chunks for "
                    f"{status_counts['active_products_count']} active XL products"
                ),
            }
        )

    task = await _mutate_task_state(
        process_id,
        mark_queued,
        created_by_user_id=created_by_user_id,
    )
    if not chunks:
        finished_at = _utc_now()

        def mark_empty_done(task_state: dict[str, Any]) -> None:
            task_state.update(
                {
                    "status": "DONE",
                    "current_step": "attribute_fill_done",
                    "current_step_started_at": finished_at,
                    "updated_at": finished_at,
                    "heartbeat_at": finished_at,
                    "finished_at": finished_at,
                    "progress_percent": 0,
                    "current_action": "Finished XL attribute fill: 0/0",
                }
            )

        return await _mutate_task_state(
            process_id,
            mark_empty_done,
            created_by_user_id=created_by_user_id,
        )

    await enqueue_jobs(
        [
            (
                "fill_active_product_attributes_chunk_task",
                {
                    "process_id": process_id,
                    "chunk_id": chunk["chunk_id"],
                    "ai_key_slot": chunk["ai_key_slot"],
                    "controller": options.controller,
                    "created_by_user_id": created_by_user_id,
                },
            )
            for chunk in chunks
        ]
    )
    for chunk in chunks:
        logger.info(
            "step=attribute_fill_chunk_enqueued process_id=%s chunk_id=%s product_count=%s ai_key_slot=%s key_label=%s",
            process_id,
            chunk["chunk_id"],
            chunk["product_count"],
            chunk["ai_key_slot"],
            _masked_key_label(chunk["ai_key_slot"]),
        )

    return task


async def run_attribute_fill_chunk_task(
    *,
    process_id: str,
    chunk_id: int,
    ai_key_slot: int | None = None,
    product_service: ProductService,
    controller: str = DEFAULT_CONTROLLER,
    created_by_user_id: int | None = None,
) -> dict[str, Any]:
    """Process one persisted active-product chunk in an ARQ worker."""

    async with SessionLocal() as session:
        chunk = (
            await session.execute(
                select(AttributeFillChunk).where(
                    AttributeFillChunk.process_id == process_id,
                    AttributeFillChunk.chunk_id == chunk_id,
                )
            )
        ).scalar_one_or_none()
        if chunk is None:
            raise ValueError(f"Attribute fill chunk not found: {process_id}/{chunk_id}")
        slot = int(ai_key_slot if ai_key_slot is not None else chunk.ai_key_slot)
        item_rows = (
            await session.execute(
                select(AttributeFillItem)
                .where(
                    AttributeFillItem.process_id == process_id,
                    AttributeFillItem.chunk_id == chunk_id,
                    AttributeFillItem.is_active.is_(True),
                )
                .order_by(AttributeFillItem.id.asc())
            )
        ).scalars().all()

    products = [dict(item.raw_product or {}) for item in item_rows]
    item_ids = [item.id for item in item_rows]
    mapper = ProductMapper(
        products=[],
        controller=controller,
        gpt_api_key=_ai_key_for_slot(slot),
    )
    category_cache: dict[str, tuple[str | None, list[dict[str, Any]]]] = {}
    pending_submit: list[dict[str, Any]] = []
    pending_submit_item_ids: list[int] = []
    chunk_total = len(products)
    started_at = _utc_now()

    async with SessionLocal() as session:
        await session.execute(
            update(AttributeFillChunk)
            .where(
                AttributeFillChunk.process_id == process_id,
                AttributeFillChunk.chunk_id == chunk_id,
            )
            .values(status="running", started_at=datetime.now(UTC))
        )
        await session.execute(
            update(AttributeFillItem)
            .where(
                AttributeFillItem.process_id == process_id,
                AttributeFillItem.chunk_id == chunk_id,
                AttributeFillItem.status == "queued",
            )
            .values(status="running", started_at=datetime.now(UTC))
        )
        await session.commit()

    def mark_chunk_started(task_state: dict[str, Any]) -> None:
        task_state["current_step"] = "attribute_fill_chunks_running"
        task_state["current_action"] = (
            f"Chunk {chunk_id} started: {chunk_total} products"
        )
        task_state["chunks_started"] = int(task_state.get("chunks_started") or 0) + 1
        task_state["updated_at"] = started_at
        task_state["heartbeat_at"] = started_at
        _append_task_item(
            task_state,
            "chunk_feed",
            {
                "chunkId": chunk_id,
                "stage": "started",
                "products": chunk_total,
                "aiKeySlot": slot,
                "at": started_at,
            },
            limit=200,
        )

    await _mutate_task_state(
        process_id,
        mark_chunk_started,
        created_by_user_id=created_by_user_id,
    )
    logger.info(
        "step=attribute_fill_chunk_start process_id=%s chunk_id=%s product_count=%s ai_key_slot=%s key_label=%s",
        process_id,
        chunk_id,
        chunk_total,
        slot,
        _masked_key_label(slot),
    )

    async def flush_pending_submit(reason: str) -> None:
        nonlocal pending_submit, pending_submit_item_ids
        if not pending_submit:
            return
        submit_count = len(pending_submit)
        submit_item_ids = list(pending_submit_item_ids)
        submit_started_at = _utc_now()

        def mark_submit_start(task_state: dict[str, Any]) -> None:
            task_state["current_action"] = (
                f"Chunk {chunk_id}: submitting {submit_count} products to OTTO"
            )
            task_state["updated_at"] = submit_started_at
            task_state["heartbeat_at"] = submit_started_at

        await _mutate_task_state(
            process_id,
            mark_submit_start,
            created_by_user_id=created_by_user_id,
        )
        try:
            await _submit_batch(
                product_service,
                controller=controller,
                products=pending_submit,
            )
            logger.info(
                "step=attribute_fill_chunk_submit_done process_id=%s chunk_id=%s reason=%s products=%s",
                process_id,
                chunk_id,
                reason,
                submit_count,
            )
            pending_submit = []
            pending_submit_item_ids = []
        except Exception as exc:
            failed_payload = pending_submit
            pending_submit = []
            pending_submit_item_ids = []
            logger.exception(
                "step=attribute_fill_chunk_submit_failed process_id=%s chunk_id=%s reason=%s products=%s error=%s",
                process_id,
                chunk_id,
                reason,
                submit_count,
                exc,
            )
            failed_at = _utc_now()

            def mark_submit_failed(task_state: dict[str, Any]) -> None:
                task_state["failed_products"] = (
                    int(task_state.get("failed_products") or 0) + submit_count
                )
                task_state["updated_at"] = failed_at
                task_state["heartbeat_at"] = failed_at
                _append_task_item(
                    task_state,
                    "issues",
                    {
                        "message": f"Chunk {chunk_id} OTTO submit failed: {exc}",
                        "products": submit_count,
                        "mediaTrace": [
                            _media_shape(item) for item in failed_payload[:3]
                        ],
                        "at": failed_at,
                    },
                    limit=100,
                )

            await _mutate_task_state(
                process_id,
                mark_submit_failed,
                created_by_user_id=created_by_user_id,
            )
            if submit_item_ids:
                async with SessionLocal() as session:
                    await session.execute(
                        update(AttributeFillItem)
                        .where(AttributeFillItem.id.in_(submit_item_ids))
                        .values(
                            status="failed",
                            error_message=f"OTTO submit failed: {exc}",
                            finished_at=datetime.now(UTC),
                        )
                    )
                    await session.commit()

    chunk_updated_count = 0
    chunk_skipped_count = 0
    chunk_failed_count = 0
    chunk_generated_attributes = 0

    for local_index, (item_id, product) in enumerate(zip(item_ids, products, strict=True), start=1):
        sku = _sku_from_item(product)
        try:
            logger.info(
                "step=attribute_fill_chunk_item_start process_id=%s chunk_id=%s local_index=%s chunk_total=%s sku=%s category=%s",
                process_id,
                chunk_id,
                local_index,
                chunk_total,
                sku,
                _category_from_product(product),
            )
            product_summary, submit_product, attributes_added = (
                await _process_attribute_product(
                    process_id=process_id,
                    chunk_id=chunk_id,
                    product=product,
                    mapper=mapper,
                    controller=controller,
                    local_index=local_index,
                    chunk_total=chunk_total,
                    category_cache=category_cache,
                    created_by_user_id=created_by_user_id,
                )
            )
            if submit_product is not None:
                pending_submit.append(submit_product)
                pending_submit_item_ids.append(item_id)
        except Exception as exc:
            logger.exception(
                "step=attribute_fill_chunk_item_failed process_id=%s chunk_id=%s sku=%s error=%s",
                process_id,
                chunk_id,
                sku,
                exc,
            )
            product_summary = _product_summary(product)
            product_summary.update(
                {
                    "status": "failed",
                    "reason": str(exc),
                    "attributesAdded": 0,
                }
            )
            attributes_added = 0

        progress_at = _utc_now()
        db_status = str(product_summary.get("status") or "skipped")
        if db_status == "done":
            chunk_updated_count += 1
            chunk_generated_attributes += int(attributes_added or 0)
        elif db_status == "failed":
            chunk_failed_count += 1
        else:
            chunk_skipped_count += 1

        async with SessionLocal() as session:
            await session.execute(
                update(AttributeFillItem)
                .where(AttributeFillItem.id == item_id)
                .values(
                    status=db_status,
                    result_summary=product_summary,
                    attributes_added=int(attributes_added or 0),
                    error_message=product_summary.get("reason")
                    if db_status == "failed"
                    else None,
                    finished_at=datetime.now(UTC),
                )
            )
            await session.commit()

        def mark_item_done(task_state: dict[str, Any]) -> None:
            total = max(1, int(task_state.get("progress_total") or 0))
            processed = int(task_state.get("processed_products") or 0) + 1
            task_state["processed_products"] = processed
            task_state["progress_completed"] = processed
            task_state["progress_percent"] = int(round((processed / total) * 100))
            if product_summary.get("status") == "failed":
                task_state["failed_products"] = (
                    int(task_state.get("failed_products") or 0) + 1
                )
            elif product_summary.get("status") == "done":
                task_state["updated_products"] = (
                    int(task_state.get("updated_products") or 0) + 1
                )
                task_state["generated_attributes"] = (
                    int(task_state.get("generated_attributes") or 0)
                    + int(attributes_added or 0)
                )
            else:
                task_state["skipped_products"] = (
                    int(task_state.get("skipped_products") or 0) + 1
                )
            task_state["last_completed_product"] = product_summary
            task_state["current_action"] = (
                f"Chunk {chunk_id}: finished {local_index}/{chunk_total} "
                f"sku={sku} status={product_summary.get('status')}"
            )
            task_state["updated_at"] = progress_at
            task_state["heartbeat_at"] = progress_at
            _append_task_item(task_state, "completed_products", product_summary, limit=200)

        await _mutate_task_state(
            process_id,
            mark_item_done,
            created_by_user_id=created_by_user_id,
        )
        logger.info(
            "step=attribute_fill_chunk_item_done process_id=%s chunk_id=%s local_index=%s chunk_total=%s sku=%s status=%s attributes_added=%s",
            process_id,
            chunk_id,
            local_index,
            chunk_total,
            sku,
            product_summary.get("status"),
            attributes_added,
        )

        if len(pending_submit) >= OTTO_SUBMIT_BATCH_SIZE:
            await flush_pending_submit("batch_full")
        await asyncio.sleep(0)

    await flush_pending_submit("chunk_done")
    finished_at = _utc_now()

    def mark_chunk_done(task_state: dict[str, Any]) -> None:
        completed_chunks = int(task_state.get("chunks_completed") or 0) + 1
        failed_chunks = int(task_state.get("chunks_failed") or 0)
        total_chunks = int(task_state.get("chunks_total") or 0)
        task_state["chunks_completed"] = completed_chunks
        task_state["updated_at"] = finished_at
        task_state["heartbeat_at"] = finished_at
        _append_task_item(
            task_state,
            "chunk_feed",
            {
                "chunkId": chunk_id,
                "stage": "done",
                "products": chunk_total,
                "at": finished_at,
            },
            limit=200,
        )
        if total_chunks and completed_chunks + failed_chunks >= total_chunks:
            failed_products = int(task_state.get("failed_products") or 0)
            task_state["status"] = "DONE" if failed_products == 0 else "FAILED"
            task_state["current_step"] = (
                "attribute_fill_done"
                if failed_products == 0
                else "attribute_fill_done_with_errors"
            )
            task_state["current_step_started_at"] = finished_at
            task_state["finished_at"] = finished_at
            task_state["progress_percent"] = 100
            task_state["current_action"] = (
                f"Finished XL attribute fill: "
                f"{task_state.get('progress_completed')}/"
                f"{task_state.get('progress_total')}"
            )
        else:
            task_state["current_action"] = (
                f"Chunk {chunk_id} done; {completed_chunks + failed_chunks}/"
                f"{total_chunks} chunks finished"
            )

    task = await _mutate_task_state(
        process_id,
        mark_chunk_done,
        created_by_user_id=created_by_user_id,
    )
    async with SessionLocal() as session:
        await session.execute(
            update(AttributeFillChunk)
            .where(
                AttributeFillChunk.process_id == process_id,
                AttributeFillChunk.chunk_id == chunk_id,
            )
            .values(
                status="done",
                processed_count=chunk_total,
                updated_count=chunk_updated_count,
                skipped_count=chunk_skipped_count,
                failed_count=chunk_failed_count,
                generated_attributes=chunk_generated_attributes,
                finished_at=datetime.now(UTC),
            )
        )
        await session.commit()
    logger.info(
        "step=attribute_fill_chunk_done process_id=%s chunk_id=%s product_count=%s updated=%s skipped=%s failed=%s generated_attrs=%s ai_key_slot=%s",
        process_id,
        chunk_id,
        chunk_total,
        chunk_updated_count,
        chunk_skipped_count,
        chunk_failed_count,
        chunk_generated_attributes,
        slot,
    )
    return task
