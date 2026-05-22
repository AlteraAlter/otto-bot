"""Afterbuy service with request-level business logic."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.afterbuy_auth import AfterbuyAuth


class AfterbuyService:
    """Service that fetches Afterbuy product pages using session-cookie auth."""

    def __init__(self, auth: AfterbuyAuth):
        self.auth = auth

    async def fetch_products_page(
        self,
        *,
        account: str,
        dataset: str,
        offset: int,
        limit: int,
    ) -> Any:
        """Fetch one raw page from `/api/products` via authenticated session cookie."""
        async with httpx.AsyncClient(timeout=self.auth.timeout, follow_redirects=True) as client:
            session = await self.auth.login_and_get_session(client)
            response = await client.get(
                f"{self.auth.base_url}/api/products",
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
        
    async def fetch_by_factory(self, factory, )
