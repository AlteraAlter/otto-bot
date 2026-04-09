"""HTTP endpoints for local product DB access and OTTO-facing workflows.

Read APIs are intentionally split:
- `/v1/products/db...` serves the local database-backed catalog
- `/v1/products/otto...` proxies OTTO marketplace product retrieval

Write/import workflows remain under `/v1/products/...`.
"""

from asyncio import sleep
from datetime import date, datetime
from io import BytesIO
from typing import Any, List, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import ColumnElement, asc, desc, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from openpyxl import load_workbook

from app.database import SessionLocal
from app.core.afterbuy_auth import AfterbuyAuth
from app.dependencies import (
    get_current_user,
    get_product_creation_service,
    get_product_service,
    require_role,
    get_afterbuy_login
)
from app.database import get_db
from app.models.product_import_tasks import ProductImportTask
from app.models.product_attributes import ProductAttributes
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
from app.schemas.product import ProductCreate, Status
from app.schemas.product_query import (
    MarketplaceStatusQuery,
    ProductListQuery,
    CategoryQuery,
)
from app.schemas.enums import SortOrderEnum
from app.schemas.enums import RoleEnum
from app.tasks import sync_afterbuy_jv_lister_task
from app.services.afterbuy_sync_service import sync_afterbuy_to_jv_lister
from app.services.product_creation_service import ProductCreationService
from app.services.product_service import ProductService

router = APIRouter(
    prefix="/v1/products",
    tags=["Products"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_role([RoleEnum.EMPLOYEE, RoleEnum.SEO])),
    ],
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
DESCRIPTION_ATTRIBUTE_NAME = "description"
BULLET_POINT_ATTRIBUTE_NAME = "bullet_point"


def _normalize_description_value(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _serialize_description_rows(rows: list[ProductAttributes]) -> dict[str, Any]:
    description: str | None = None
    bullet_points: list[str] = []
    attribute_values: dict[str, list[str]] = {}

    for row in rows:
        name = _normalize_description_value(row.name)
        value = _normalize_description_value(row.value)
        if not name or not value:
            continue

        if name == DESCRIPTION_ATTRIBUTE_NAME:
            if description is None:
                description = value
            continue

        if name == BULLET_POINT_ATTRIBUTE_NAME:
            bullet_points.append(value)
            continue

        attribute_values.setdefault(name, []).append(value)

    attributes = [
        {"name": name, "values": values}
        for name, values in attribute_values.items()
    ]

    return {
        "description": description,
        "bulletPoints": bullet_points,
        "attributes": attributes,
    }


async def _load_product_description_payloads(
    db: AsyncSession,
    skus: list[str],
) -> dict[str, dict[str, Any]]:
    unique_skus = list(dict.fromkeys(sku for sku in skus if sku))
    if not unique_skus:
        return {}

    result = await db.execute(
        select(ProductAttributes)
        .where(ProductAttributes.product_sku.in_(unique_skus))
        .order_by(
            ProductAttributes.product_sku.asc(),
            ProductAttributes.id.asc(),
        )
    )
    rows = result.scalars().all()

    rows_by_sku: dict[str, list[ProductAttributes]] = {}
    for row in rows:
        rows_by_sku.setdefault(row.product_sku, []).append(row)

    return {
        sku: _serialize_description_rows(product_rows)
        for sku, product_rows in rows_by_sku.items()
    }


def _product_to_dict(
    product: Product,
    description_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Serialize the local spreadsheet-backed product row."""
    description_payload = description_payload or {}
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
        "description": description_payload.get("description"),
        "bulletPoints": description_payload.get("bulletPoints") or [],
        "attributes": description_payload.get("attributes") or [],
        "lastChangedAt": (
            product.last_changed_at.isoformat() if product.last_changed_at else None
        ),
    }


def _summarize_task_error(exc: Exception) -> str:
    """Store a short task error message instead of a full traceback/SQL dump."""
    message = str(exc).strip() or exc.__class__.__name__
    lowered = message.lower()

    if any(
        token in lowered
        for token in (
            "sqlalchemy",
            "asyncpg",
            "psycopg",
            "postgres",
            "database",
            "duplicate key",
            "violates",
            "constraint",
            "select ",
            "insert ",
            "update ",
            "delete ",
            " from ",
            " where ",
        )
    ):
        return "Database operation failed while processing this job. Please retry in a few minutes."
    if any(
        token in lowered
        for token in ("timeout", "timed out", "read timeout", "connect timeout")
    ):
        return "The operation timed out while fetching data. Please retry in a few minutes."
    if any(
        token in lowered
        for token in ("connection refused", "could not connect", "network", "temporarily unavailable")
    ):
        return "A temporary connection problem occurred. Please retry in a few minutes."

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
        sku_values = {_as_text(row.get("sku")) for row in chunk if _as_text(row.get("sku"))}
        ean_values = {_as_text(row.get("ean")) for row in chunk if _as_text(row.get("ean"))}
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
                existing_by_reference.get(product_reference) if product_reference else None,
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
                existing_by_reference[matched_product.product_reference] = matched_product

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


def _has_non_empty_description_expression():
    return exists(
        select(ProductAttributes.id).where(
            ProductAttributes.product_sku == Product.sku,
            ProductAttributes.name == DESCRIPTION_ATTRIBUTE_NAME,
            func.length(func.trim(ProductAttributes.value)) > 0,
        )
    )


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
    include_total: bool = Query(default=False, alias="includeTotal"),
):
    """Return paginated spreadsheet-imported rows that have descriptions."""
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

    filters: list[ColumnElement[bool]] = [_has_non_empty_description_expression()]
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

    stmt = (
        select(Product)
        .order_by(sorter(sort_column), sorter(Product.id))
        .offset(page * limit)
        .limit(limit + 1)
    )
    if filters:
        stmt = stmt.where(*filters)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    has_next = len(rows) > limit
    items = rows[:limit]
    description_payloads = await _load_product_description_payloads(
        db,
        [item.sku for item in items if item.sku],
    )

    total: int | None = None
    if include_total:
        count_stmt = select(func.count()).select_from(Product)
        if filters:
            count_stmt = count_stmt.where(*filters)
        total = await db.scalar(count_stmt)
    else:
        # Return a lower-bound total to keep pagination usable without expensive count(*).
        total = (page * limit) + len(items) + (1 if has_next else 0)

    return {
        "items": [
            _product_to_dict(item, description_payloads.get(item.sku or ""))
            for item in items
        ],
        "page": page,
        "limit": limit,
        "hasNext": has_next,
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


@router.get("/otto")
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


@router.get("/otto/update-tasks/{pid}")
@router.get("/update-tasks/{pid}", include_in_schema=False)
async def update_tasks(
    pid: str,
    product_service: ProductService = Depends(get_product_service),
):
    """Trigger OTTO update-task execution for a single product id (`pid`)."""
    return await product_service.update_tasks(pid)


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
):
    """List available categories from OTTO, optionally filtered by category name."""
    payload = CategoryQuery(page=page, limit=limit, category=category).to_payload()
    return await product_service.get_categories(payload)


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
    description_payloads = await _load_product_description_payloads(
        db,
        [product.sku] if product.sku else [],
    )
    return _product_to_dict(product, description_payloads.get(product.sku or ""))


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
@router.post("/create")
async def create_or_update_products(
    payload: List[ProductCreate],
    product_service: ProductService = Depends(get_product_service),
):
    """Create or update products in OTTO from already validated request payloads."""
    payload_list = [item.model_dump(mode="json", exclude_none=True) for item in payload]
    return await product_service.create_or_update_products(payload_list)


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
    current_user = Depends(require_role([RoleEnum.SEO])),
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
    _current_user = Depends(require_role([RoleEnum.SEO])),
    limit: int = Query(default=20, ge=1, le=100),
):
    stmt = (
        select(ProductImportTask)
        .order_by(ProductImportTask.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()
    return ProductImportTaskListResponse(
        items=[_task_to_dto(task) for task in tasks]
    )


@router.get(
    "/import-tasks/{task_id}",
    response_model=ProductImportTaskDTO,
)
async def get_product_import_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user = Depends(require_role([RoleEnum.SEO])),
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
    except Exception:
        task.status = "failed"
        task.error_message = "Could not enqueue the background worker task. Please retry in a minute."
        task.finished_at = datetime.utcnow()
        await db.commit()
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=ProductCreationErrorResponse(
                message="Could not enqueue Afterbuy fetch task",
            ).model_dump(),
        )
    return _task_to_dto(task)


@router.api_route("/fetch-afterbuy", methods=["GET", "POST"])
@router.api_route("/fetch_afterbuy", methods=["GET", "POST"], include_in_schema=False)
async def fetch_from_afterbuy(
    db: AsyncSession = Depends(get_db),
    afterbuy: AfterbuyAuth = Depends(get_afterbuy_login),
    _current_user=Depends(require_role([RoleEnum.SEO])),
    account: str = Query(default="JV"),
    dataset: str = Query(default="lister"),
    limit: int = Query(default=100000, ge=1, le=100000),
    start_page: int = Query(default=0, ge=0, alias="startPage"),
):
    """Fetch Afterbuy pages until empty and upsert rows into the local JV lister table."""
    result = await sync_afterbuy_to_jv_lister(
        db=db,
        afterbuy=afterbuy,
        account=account,
        dataset=dataset,
        limit=limit,
        start_page=start_page,
    )
    return {
        **result,
        "table": "jv_lister",
    }


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
    description_payloads = await _load_product_description_payloads(
        db,
        [product.sku] if product.sku else [],
    )
    return _product_to_dict(product, description_payloads.get(product.sku or ""))
@router.get("/otto/{sku}")
async def get_otto_product(
    sku: str,
    product_service: ProductService = Depends(get_product_service),
):
    """Fetch one product directly from OTTO by SKU."""
    return await product_service.get_product(sku)
