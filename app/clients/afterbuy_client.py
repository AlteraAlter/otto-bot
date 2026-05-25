"""Low-level HTTP client for Afterbuy endpoints."""

from __future__ import annotations

from typing import Any

import httpx

# Schemas
from app.schemas.afterbuy_products_response import (
    ProductBase,
    ProductFetchResponse,
    FactoriesFetchResponse,
)


class AfterbuyClient:
    """Transport client for Afterbuy requests."""

    def __init__(self, *, base_url: str, timeout: float):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def send_request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
        cookies: dict[str, str] | None = None,
    ) -> httpx.Response:
        async with httpx.AsyncClient(
            timeout=self.timeout, follow_redirects=True
        ) as client:
            return await client.request(
                method=method,
                url=f"{self.base_url}{path}",
                params=params,
                json=json,
                cookies=cookies,
            )

    async def login(self, *, username: str, password: str) -> str:
        """Получает сессию из запроса на логин"""

        response = await self.send_request(
            "POST",
            "/auth/login",
            json={"username": username, "password": password},
        )
        response.raise_for_status()
        session = response.cookies.get("session")
        if not session:
            raise RuntimeError(
                "Aftercool login succeeded but `session` cookie was not found."
            )
        return session

    async def get_products_page(
        self,
        *,
        session: str,
        account: str,
        dataset: str,
        offset: int,
        limit: int,
    ):
        """Fetch one raw page from `/api/products` using a `session` cookie."""
        response = await self.send_request(
            "GET",
            "/api/products",
            params={
                "account": account,
                "dataset": dataset,
                "offset": offset,
                "limit": limit,
            },
            cookies={"session": session},
        )
        response.raise_for_status()
        return response.json()
    
    async def fetch_factory(self, session) -> FactoriesFetchResponse:
        """Получает все фабрики"""
        
        response = await self.send_request(
            "GET",
            "/api/factories",
            cookies={"session": session}
        )
        response.raise_for_status()
        result = response.json()
        return FactoriesFetchResponse(factory = result.get("items"))
    
    
    async def get_products_by_factory_id(self, session, controller, factory_id):
        """Получает фильтрованные данные по контроллеру и фабрике"""
        
        response = await self.send_request(
            "GET",
            "/api/products",
            params={
                "account": controller.value,
                "dataset": "lister",
                "factory_id": factory_id,
                "include_row": 1,
                "limit": 0
            },
            cookies={"session": session}
        )
        
        response.raise_for_status()
        
        result = response.json().get("items", None)
        raw_datas = [item.get("row", None) for item in result]
        products = [ProductBase.model_validate(data) for data in raw_datas if data]
        

        return ProductFetchResponse(products=products)
        