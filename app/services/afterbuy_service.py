"""Afterbuy service with request-level business logic."""

from __future__ import annotations
from datetime import datetime

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

# Scheme
from app.clients.afterbuy_client import (
    AfterbuyClient,
    FactoriesFetchResponse,
)

# Models
from app.models.factories import Factories

from app.core.afterbuy_auth import AfterbuyAuth
from app.schemas.enums import Controller

# Schemas
from app.schemas.afterbuy_products_response import (
    FactoryBase,
    ProductFetchResponse,
)
from app.schemas.afterbuy_enums import Kind


class AfterbuyService:
    """Service that orchestrates Afterbuy login and product-page retrieval."""

    def __init__(self, auth: AfterbuyAuth, client: AfterbuyClient):
        self.auth = auth
        self.client = client

    async def fetch_products_page(
        self,
        *,
        account: str,
        dataset: str,
        offset: int,
        limit: int,
    ) -> Any:
        """Фетчит продукты из Афтеркула"""

        session = await self.client.login(
            username=self.auth.username,
            password=self.auth.password,
        )
        return await self.client.get_products_page(
            session=session,
            account=account,
            dataset=dataset,
            offset=offset,
            limit=limit,
        )

    async def fetch_factory(
        self, save: bool, db: AsyncSession
    ) -> FactoriesFetchResponse:
        """Фетчит фабрики и сейвит в бд"""
        session = await self.client.login(
            username=self.auth.username,
            password=self.auth.password,
        )

        response = await self.client.fetch_factory(session)
        filtered_result = [
            factory for factory in response.factory if factory.items_count > 0
        ]
        if save:
            await db.execute(delete(Factories))
            factory_orm_object = [
                Factories(
                    factory_id=item.id,
                    name=item.name,
                    kind=item.kind.value,
                    account=item.account,
                    items_count=item.items_count,
                    last_changed_at=datetime.now(),
                )
                for item in filtered_result
            ]
            db.add_all(factory_orm_object)
            await db.commit()

        return FactoriesFetchResponse(factory=filtered_result)

    async def get_factory(self, controller: Controller, session: AsyncSession):
        result = await session.execute(
            select(Factories).where(Factories.account == controller.value.upper())
        )

        factories = result.scalars().all()
        mapped = [
            FactoryBase(
                account=item.account,
                kind=Kind(str(item.kind).lower()),
                id=item.factory_id,
                name=item.name,
                items_count=item.items_count,
            )
            for item in factories
        ]
        return FactoriesFetchResponse(factory=mapped)

    async def get_products_by_factory_id(
        self, controller: Controller, factory_id: Optional[int]
    ) -> ProductFetchResponse:
        session = await self.client.login(
            username=self.auth.username,
            password=self.auth.password,
        )
        return await self.client.get_products_by_factory_id(
            session, controller, factory_id
        )
