"""Afterbuy-specific endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_afterbuy_login
from app.database import get_db

from app.services.afterbuy_service import AfterbuyService

from app.schemas.enums import RoleEnum, Controller

from app.schemas.afterbuy_products_response import (
    ProductFetchResponse,
    FactoriesFetchResponse,
)

router = APIRouter(prefix="/v1/afterbuy", tags=["Afterbuy"])


@router.get("/fetch-raw")
async def fetch_from_afterbuy_raw(
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
    account: str = Query(default="JV"),
    dataset: str = Query(default="lister"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=1000, ge=1, le=100000),
):
    return await afterbuy.fetch_products_page(
        account=account,
        dataset=dataset,
        offset=offset,
        limit=limit,
    )


@router.get("/load-factories-by-controller", response_model=FactoriesFetchResponse)
async def load_factories_by_controller(
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
    session: AsyncSession = Depends(get_db),
    controller: Controller = Controller.JV,
):
    return await afterbuy.get_factory(controller, session)


@router.get("/fetch-by-factory-id", response_model=ProductFetchResponse)
async def get_by_factory_id(
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
    controller: Controller = Controller.JV,
    factory_id: Optional[int] = None,
):
    return await afterbuy.get_products_by_factory_id(controller, factory_id)


@router.get("/fetch-factory", response_model=FactoriesFetchResponse)
async def get_factory(
    save: bool = False,
    db: AsyncSession = Depends(get_db),
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
):
    return await afterbuy.fetch_factory(save, db)
