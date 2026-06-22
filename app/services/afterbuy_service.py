"""Afterbuy service with request-level business logic."""

from __future__ import annotations

import asyncio
import html
import logging
import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from bs4 import BeautifulSoup
except ModuleNotFoundError:
    BeautifulSoup = None

# Scheme
from app.clients.afterbuy_client import (
    AfterbuyClient,
    FactoriesFetchResponse,
)
from app.core.afterbuy_auth import AfterbuyAuth

# Models
from app.models.factories import Factories
from app.schemas.afterbuy_enums import Kind

# Schemas
from app.schemas.afterbuy_products_response import (
    FactoryBase,
    ProductFetchResponse,
)
from app.schemas.enums import Controller


class AfterbuyService:
    """Service that orchestrates Afterbuy login and product-page retrieval."""

    def __init__(self, auth: AfterbuyAuth, client: AfterbuyClient):
        self.auth = auth
        self.client = client
        self.logger = logging.getLogger("product_mapper_flow")

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
        self,
        controller: Controller,
        factory_id: Optional[int],
        limit: int | None = None,
    ) -> ProductFetchResponse:
        session = await self.client.login(
            username=self.auth.username,
            password=self.auth.password,
        )
        return await self.client.get_products_by_factory_id(
            session, controller, factory_id, limit=limit
        )

    async def enrich_items_with_stammartikel_description(
        self,
        *,
        controller: Controller,
        items: list[dict[str, Any]],
        concurrency: int = 5,
    ) -> None:
        """Add parent description and a missing variation price in-place."""
        stammartikels = {
            str(item.get("I_stammartikel") or "").strip()
            for item in items
            if str(item.get("I_stammartikel") or "").strip()
        }
        if not stammartikels:
            return

        session = await self.client.login(
            username=self.auth.username,
            password=self.auth.password,
        )
        semaphore = asyncio.Semaphore(concurrency)
        description_by_stammartikel: dict[str, str] = {}
        price_by_stammartikel: dict[str, str] = {}
        fetched_count = 0

        async def _fetch_one(stammartikel: str) -> None:
            nonlocal fetched_count
            async with semaphore:
                row = await self.client.get_lister_row_by_query(
                    session=session,
                    account=controller.value,
                    query=stammartikel,
                )
            if not row:
                return

            fetched_count += 1
            description = _extract_stammartikel_details_html(
                row.get("Beschreibung")
                or row.get("Description")
                or row.get("TranslatedDescription")
            )
            if description:
                description_by_stammartikel[stammartikel] = description
            parent_price = _first_positive_price(
                row.get("Startpreis"),
                row.get("Preis"),
                row.get("VKPreis"),
                row.get("Verkaufspreis"),
                row.get("BuyItNowPrice"),
            )
            if parent_price is not None:
                price_by_stammartikel[stammartikel] = parent_price

        await asyncio.gather(*[_fetch_one(value) for value in stammartikels])

        for item in items:
            stammartikel = str(item.get("I_stammartikel") or "").strip()
            description = description_by_stammartikel.get(stammartikel)
            if description:
                item["StammartikelBeschreibungDetailsHtml"] = description
            if _first_positive_price(item.get("Startpreis")) is None:
                parent_price = price_by_stammartikel.get(stammartikel)
                if parent_price is not None:
                    item["Startpreis"] = parent_price

        self.logger.info(
            "step=fetch_stammartikel_descriptions_summary requested=%s fetched=%s descriptions=%s prices=%s",
            len(stammartikels),
            fetched_count,
            len(description_by_stammartikel),
            len(price_by_stammartikel),
        )


def _first_positive_price(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        compact = re.sub(r"[^\d,.-]", "", text)
        if not compact:
            continue
        if "," in compact and "." in compact:
            if compact.rfind(",") > compact.rfind("."):
                compact = compact.replace(".", "").replace(",", ".")
            else:
                compact = compact.replace(",", "")
        elif "," in compact:
            compact = compact.replace(",", ".")
        try:
            if float(compact) > 0:
                return text
        except ValueError:
            continue
    return None


def _extract_stammartikel_details_html(raw_description: Any) -> str | None:
    if raw_description is None:
        return None

    text = html.unescape(str(raw_description)).strip()
    if not text:
        return None

    normalized_text = (
        text.replace("\\&quot;", '"')
        .replace('\\"', '"')
        .replace("&quot;", '"')
    )

    if BeautifulSoup is not None:
        soup = BeautifulSoup(normalized_text, "html.parser")
        panels = soup.select_one(".tabs__panels")
        if panels is not None:
            return str(panels).strip()

    start_match = re.search(
        r"<div[^>]*tabs__panels[^>]*>",
        normalized_text,
        flags=re.IGNORECASE,
    )
    if start_match:
        return _extract_balanced_div(normalized_text, start_match.start())

    return None


def _extract_balanced_div(text: str, start_index: int) -> str | None:
    depth = 0
    for match in re.finditer(r"</?div\b[^>]*>", text[start_index:], re.IGNORECASE):
        tag = match.group(0)
        if tag.startswith("</"):
            depth -= 1
            if depth == 0:
                end_index = start_index + match.end()
                return text[start_index:end_index].strip()
        else:
            depth += 1

    return None
