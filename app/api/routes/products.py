"""HTTP endpoints for product read/write and file-based creation workflows.

This router combines three responsibilities:
1. Direct read/write operations against local product tables.
2. Proxy-style calls to OTTO APIs through service objects.
3. Batch creation flows that normalize uploaded JSON before sending it upstream.

Keeping those concerns in one place allows the frontend to work with a single
resource surface (`/v1/products`) while the backend decides whether data should
be served from the local database or from OTTO-facing services.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    get_current_user,
    get_product_creation_service,
    get_product_service,
)
from app.database import get_db
from app.models.product_attributes import ProductAttributes
from app.models.products import Product
from app.schemas.marketplaceStatus import MarketPlaceStatus
from app.schemas.product_creation import (
    ProductCreationErrorResponse,
    ProductCreationFileResponse,
    ProductCreationPreparedRequest,
    ProductCreationPrepareResponse,
)
from app.schemas.product import ProductCreate, Status
from app.schemas.product_query import (
    MarketplaceStatusQuery,
    ProductListQuery,
    CategoryQuery,
)
from app.schemas.enums import SortOrderEnum
from app.services.product_creation_service import ProductCreationService
from app.services.product_service import ProductService
from app.services.product_sync_service import ProductSyncService

router = APIRouter(
    prefix="/v1/products",
    tags=["Products"],
    dependencies=[Depends(get_current_user)],
)


def _group_attributes_by_sku(rows: list[ProductAttributes]) -> dict[str, list[dict]]:
    """Transform flat attribute rows into OTTO-like grouped attributes per SKU.

    The DB stores one row per `(sku, attribute_name, value)`. API payloads expect
    one attribute object per name with all values collected under `values`.
    This helper performs that grouping and de-duplicates repeated values.
    """
    grouped: dict[str, dict[str, list[str]]] = {}
    for row in rows:
        sku = row.product_sku
        name = row.name
        value = row.value
        if not sku or not name or not value:
            continue

        sku_bucket = grouped.setdefault(sku, {})
        values = sku_bucket.setdefault(name, [])
        if value not in values:
            values.append(value)

    return {
        sku: [
            {
                "name": name,
                "values": values,
                "additional": False,
            }
            for name, values in attrs.items()
        ]
        for sku, attrs in grouped.items()
    }


def _product_to_dict(product: Product, attributes: list[dict] | None = None) -> dict:
    """Serialize a `Product` ORM object into the response contract used by routes.

    Some route responses mirror OTTO payload shapes while still including local
    convenience fields such as `id`, `price`, and flattened `vat`.
    """
    attrs = attributes or []
    vat_value = product.vat.value if hasattr(product.vat, "value") else str(product.vat)
    return {
        "id": product.id,
        "sku": product.sku,
        "accountSource": product.account_source,
        "ean": product.ean,
        "pricing": {
            "standardPrice": {
                "amount": product.pricing,
                "currency": "EUR",
            },
            "vat": vat_value,
        },
        "price": product.pricing,
        "vat": vat_value,
        "productReference": product.productReference,
        "brandId": product.brand_id,
        "category": product.category,
        "productLine": product.productLine,
        "description": product.description,
        "bulletPoints": product.bullet_points,
        "productDescription": {
            "brandId": product.brand_id,
            "category": product.category,
            "productLine": product.productLine,
            "description": product.description,
            "bulletPoints": product.bullet_points,
            "attributes": attrs,
        },
        "mediaAssets": [],
        "attributes": attrs,
    }


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


@router.get("")
async def get_products(
    db: AsyncSession = Depends(get_db),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(30, ge=10, le=1000),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
    account_source: Optional[str] = Query(None, alias="accountSource"),
    search: Optional[str] = Query(None),
    sort_by: str = Query("id", alias="sortBy"),
    sort_order: SortOrderEnum = Query(default=SortOrderEnum.DESC, alias="sortOrder"),
):
    """Return paginated products from the local DB with optional filtering/search.

    This endpoint is intended for internal UI usage, so it supports richer local
    filtering and free-text search than OTTO list endpoints usually provide.
    """
    print(product_reference, page, sku, category, search, sort_by, sort_order)
    sort_columns = {
        "id": Product.id,
        "sku": Product.sku,
        "productReference": Product.productReference,
        "productLine": Product.productLine,
        "category": Product.category,
        "brandId": Product.brand_id,
        "ean": Product.ean,
        "price": Product.pricing,
    }
    sort_column = sort_columns.get(sort_by, Product.id)
    print(f"The sort column is: {sort_column}")
    sorter = asc if sort_order == SortOrderEnum.ASC else desc

    filters = []
    if sku:
        filters.append(Product.sku == sku)
    if product_reference:
        filters.append(Product.productReference == product_reference)
    if category:
        filters.append(Product.category == category)
    if brand_id:
        filters.append(Product.brand_id == brand_id)
    if account_source:
        filters.append(func.upper(Product.account_source) == account_source.upper())
    if search:
        if term := search.strip():
            pattern = f"%{term}%"
            filters.append(
                or_(
                    Product.sku.ilike(pattern),
                    Product.productReference.ilike(pattern),
                    Product.productLine.ilike(pattern),
                    Product.ean.ilike(pattern),
                    Product.category.ilike(pattern),
                    Product.brand_id.ilike(pattern),
                    Product.description.ilike(pattern),
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

    attrs_by_sku: dict[str, list[dict]] = {}
    skus = [item.sku for item in items if item.sku]
    if skus:
        attrs_result = await db.execute(
            select(ProductAttributes).where(ProductAttributes.product_sku.in_(skus))
        )
        attrs_by_sku = _group_attributes_by_sku(list(attrs_result.scalars().all()))

    return {
        "items": [
            _product_to_dict(item, attrs_by_sku.get(item.sku, [])) for item in items
        ],
        "page": page,
        "limit": limit,
        "total": total or 0,
    }


@router.get("/active")
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


@router.get("/update-tasks/{pid}")
async def update_tasks(
    pid: str,
    product_service: ProductService = Depends(get_product_service),
):
    """Trigger OTTO update-task execution for a single product id (`pid`)."""
    return await product_service.update_tasks(pid)


@router.get("/marketplace-status")
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


@router.get("/categories")
async def get_categories(
    product_service: ProductService = Depends(get_product_service),
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=0, le=2000),
    category: Optional[str] = Query(None),
):
    """List available categories from OTTO, optionally filtered by category name."""
    payload = CategoryQuery(page=page, limit=limit, category=category).to_payload()
    return await product_service.get_categories(payload)


@router.get("/status/{sku}")
async def get_product_by_status_path(
    sku: str,
    db: AsyncSession = Depends(get_db),
    account_source: Optional[str] = Query(None, alias="accountSource"),
):
    """Fetch one product from the local DB by SKU and return API-shaped payload.

    Historical entries may exist per SKU and account source, so records are
    ordered by latest `id` and only the newest one is returned.
    """
    stmt = select(Product).where(Product.sku == sku)
    if account_source:
        stmt = stmt.where(func.upper(Product.account_source) == account_source.upper())
    stmt = stmt.order_by(Product.id.desc())

    result = await db.execute(stmt)
    product = result.scalars().first()
    if not product:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"message": f"Product with sku '{sku}' not found in DB"},
        )

    attrs_result = await db.execute(
        select(ProductAttributes).where(ProductAttributes.product_sku == product.sku)
    )
    attrs_by_sku = _group_attributes_by_sku(list(attrs_result.scalars().all()))
    return _product_to_dict(product, attrs_by_sku.get(product.sku, []))


@router.get("/{sku}")
async def get_product(
    sku: str,
    db: AsyncSession = Depends(get_db),
    account_source: Optional[str] = Query(None, alias="accountSource"),
):
    """Fetch one product from the local DB by SKU (generic product lookup path)."""
    stmt = select(Product).where(Product.sku == sku)
    if account_source:
        stmt = stmt.where(func.upper(Product.account_source) == account_source.upper())
    stmt = stmt.order_by(Product.id.desc())

    result = await db.execute(stmt)
    product = result.scalars().first()
    if not product:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"message": f"Product with sku '{sku}' not found in DB"},
        )

    attrs_result = await db.execute(
        select(ProductAttributes).where(ProductAttributes.product_sku == product.sku)
    )
    attrs_by_sku = _group_attributes_by_sku(list(attrs_result.scalars().all()))
    return _product_to_dict(product, attrs_by_sku.get(product.sku, []))


@router.post("/sync-to-db")
async def sync_products_to_db(
    product_service: ProductService = Depends(get_product_service),
    db: AsyncSession = Depends(get_db),
    account_source: str = Query(
        default="JV", alias="accountSource", min_length=2, max_length=20
    ),
    limit: int = Query(default=100, ge=10, le=100),
    max_pages: Optional[int] = Query(default=None, alias="maxPages", ge=1, le=10000),
):
    """Pull OTTO products page-by-page and upsert them into local DB tables."""
    sync_service = ProductSyncService(product_service=product_service, db=db)
    return await sync_service.sync_products(
        account_source=account_source.upper(),
        limit=limit,
        max_pages=max_pages,
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
