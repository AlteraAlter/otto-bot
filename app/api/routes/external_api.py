from app.schemas.external_schemes.until_schemes import (
    ActiveStatusByEanRequest,
    ActiveStatusByEanResponse,
    CreateOrUpdateProductVariationRequest,
    GetProductRequest,
    ShippingProfileResponse,
)
from app.schemas.product_query import CategoryQuery
from app.schemas.product_response import (
    ExternalCategoriesResponse,
    ExternalCategoryAttributesResponse,
)
from app.dependencies import get_external_api_service, get_external_repository
from app.database import get_db
from app.services.extermal_service import ExternalService
from app.repository.external_api_repository import ExternalApiRepository
from app.schemas.enums import Controller

from fastapi import APIRouter, Query, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

router = APIRouter(prefix="/extermal", tags=["external"])


@router.get("/get_products")
async def get_products(
    sku: str | None = Query(
        default=None,
        min_length=13,
        max_length=13,
        description="Уникальный идентификатор продукта. Если указан, возвращается 1 продукт",
    ),
    product_reference: str | None = Query(
        default=None,
        alias="productReference",
        description="Идентификатор для вариации продукта",
    ),
    category: str | None = Query(default=None, description="Категория продукта"),
    ean: str | None = Query(
        default=None,
        min_length=8,
        max_length=13,
        description="EAN продукта",
    ),
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1),
    controller: Controller = Query(
        default=Controller.JV,
        description="На каком аккаунте операция будет происходить",
    ),
    service: ExternalService = Depends(get_external_api_service),
):
    payload = GetProductRequest(
        sku=sku,
        productReference=product_reference,
        ean=ean,
        category=category,
        page=page,
        limit=limit,
    )
    data = await service.get_products(payload, controller)

    return data


@router.post("/create_or_update_product")
async def create_or_update_product(
    payload: Annotated[CreateOrUpdateProductVariationRequest, Body()],
    controller: Annotated[str, Query()] = "jv",
    service: ExternalService = Depends(get_external_api_service),
    repository: ExternalApiRepository = Depends(get_external_repository),
):
    data = await service.create_or_update_product(payload, controller)
    return data


@router.post("/activate", response_model=ActiveStatusByEanResponse)
async def activate_product_by_ean(
    payload: Annotated[ActiveStatusByEanRequest, Body()],
    service: ExternalService = Depends(get_external_api_service),
):
    return await service.set_active_status_by_ean(payload, active=True)


@router.post("/deactivate", response_model=ActiveStatusByEanResponse)
async def deactivate_product_by_ean(
    payload: Annotated[ActiveStatusByEanRequest, Body()],
    service: ExternalService = Depends(get_external_api_service),
):
    return await service.set_active_status_by_ean(payload, active=False)


@router.get("/shipping_profiles", response_model=ShippingProfileResponse)
async def get_shipping_profiles(
    controller: Annotated[str, Query()] = "jv",
    service: ExternalService = Depends(get_external_api_service),
):
    data = await service.get_shipping_profiles(controller)
    return data


@router.get("/categories", response_model=ExternalCategoriesResponse)
async def get_categories(
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=0),
    category: str | None = Query(default=None),
    service: ExternalService = Depends(get_external_api_service),
    db: AsyncSession = Depends(get_db),
):
    payload = CategoryQuery(
        page=page,
        limit=limit,
        category=category,
    ).to_payload()
    data = await service.get_categories(payload, "jv", db)
    return data


@router.get("/attributes", response_model=ExternalCategoryAttributesResponse)
async def get_category_attributes(
    category_id: int = Query(alias="categoryId", ge=1),
    service: ExternalService = Depends(get_external_api_service),
    db: AsyncSession = Depends(get_db),
):
    data = await service.get_category_attributes(category_id, "jv", db)
    return data
