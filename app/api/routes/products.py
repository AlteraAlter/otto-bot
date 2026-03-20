from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import JSONResponse

from app.dependencies import get_product_creation_service, get_product_service
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

router = APIRouter(prefix="/v1/products", tags=["Products"])


def _product_list_payload(
    *,
    product_reference: Optional[str],
    page: int,
    sku: Optional[str],
    limit: int,
    category: Optional[str],
    brand_id: Optional[str],
) -> dict:
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
    product_service: ProductService = Depends(get_product_service),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(100, ge=10, le=100),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
):
    payload = _product_list_payload(
        product_reference=product_reference,
        page=page,
        sku=sku,
        limit=limit,
        category=category,
        brand_id=brand_id,
    )
    return await product_service.get_products(payload)


@router.get("/active")
async def get_active_products(
    product_service: ProductService = Depends(get_product_service),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(100, ge=10, le=100),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
):
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
    payload = CategoryQuery(page=page, limit=limit, category=category).to_payload()
    return await product_service.get_categories(payload)


@router.get("/status/{sku}")
async def get_product_by_status_path(
    sku: str,
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.get_product(sku)


@router.get("/{sku}")
async def get_product(
    sku: str,
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.get_product(sku)


# <======= POST METHOD =======>
@router.post("/create")
async def create_or_update_products(
    payload: List[ProductCreate],
    product_service: ProductService = Depends(get_product_service),
):
    payload_list = [
        item.model_dump(mode="json", exclude_none=True)
        for item in payload
    ]
    return await product_service.create_or_update_products(
        payload_list
    )


@router.post("/update-status")
async def update_status(
    payload: Status,
    product_service: ProductService = Depends(get_product_service),
):
    return await product_service.update_status(
        payload.model_dump(mode="json", exclude_none=True)
    )


@router.post(
    "/prepare-from-file",
    response_model=ProductCreationPrepareResponse,
    responses={
        400: {"model": ProductCreationErrorResponse, "description": "Invalid request"},
        415: {"model": ProductCreationErrorResponse, "description": "Unsupported media type"},
    },
)
async def prepare_products_from_file(
    file: UploadFile = File(..., description="JSON file with one object or an array of objects"),
    max_chars: int = Form(default=2000, ge=300, le=5000),
    creation_service: ProductCreationService = Depends(get_product_creation_service),
):
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
            content=ProductCreationErrorResponse(message="Uploaded file is empty").model_dump(),
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
        422: {"model": ProductCreationErrorResponse, "description": "Validation failed"},
        502: {"model": ProductCreationErrorResponse, "description": "Upstream creation failed"},
    },
)
async def create_products_from_prepared(
    payload: ProductCreationPreparedRequest,
    creation_service: ProductCreationService = Depends(get_product_creation_service),
):
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

    created_items, create_issues = await creation_service.create_products(validated_payloads)
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
        415: {"model": ProductCreationErrorResponse, "description": "Unsupported media type"},
        422: {"model": ProductCreationErrorResponse, "description": "Validation failed"},
        502: {"model": ProductCreationErrorResponse, "description": "Upstream creation failed"},
    },
)
async def create_products_from_file(
    file: UploadFile = File(..., description="JSON file with one object or an array of objects"),
    max_chars: int = Form(default=2000, ge=300, le=5000),
    creation_service: ProductCreationService = Depends(get_product_creation_service),
):
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
            content=ProductCreationErrorResponse(message="Uploaded file is empty").model_dump(),
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

    if result.created_items == 0 or any(issue.stage == "create" for issue in result.issues):
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
