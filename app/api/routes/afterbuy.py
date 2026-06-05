"""Afterbuy endpoints used by the product creation flow."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_afterbuy_login
from app.database import get_db

from app.services.afterbuy_service import AfterbuyService

from app.schemas.enums import Controller

from app.schemas.afterbuy_products_response import (
    FactoriesFetchResponse,
)

router = APIRouter(prefix="/v1/afterbuy", tags=["Afterbuy"])


@router.get("/load-factories-by-controller", response_model=FactoriesFetchResponse)
async def load_factories_by_controller(
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
    session: AsyncSession = Depends(get_db),
    controller: Controller = Controller.JV,
):
    return await afterbuy.get_factory(controller, session)


@router.get("/fetch-factory", response_model=FactoriesFetchResponse)
async def get_factory(
    save: bool = False,
    db: AsyncSession = Depends(get_db),
    afterbuy: AfterbuyService = Depends(get_afterbuy_login),
):
    return await afterbuy.fetch_factory(save, db)
