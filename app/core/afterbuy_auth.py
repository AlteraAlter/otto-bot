"""Afterbuy authentication and paginated product fetch helpers."""

from __future__ import annotations

from typing import Any

import httpx


class AfterbuyAuth:
    """Small HTTP helper that logs in and fetches products from Afterbuy."""

    def __init__(
        self,
        *,
        username: str,
        password: str,
        base_url: str,
        timeout: float = 30.0,
    ):
        self.username = username
        self.password = password
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def _login(self, client: httpx.AsyncClient) -> dict[str, str]:
        """Authenticate and return headers when a bearer token is provided."""
        response = await client.post(
            "/auth/login",
            json={
                "username": self.username,
                "password": self.password,
            },
        )
        response.raise_for_status()

        try:
            payload = response.json()
        except ValueError:
            return {}

        token = None
        if isinstance(payload, dict):
            for key in ("access_token", "accessToken", "token", "jwt"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    token = value.strip()
                    break

        if token:
            return {"Authorization": f"Bearer {token}"}
        return {}

    async def fetch_products_page(
        self,
        *,
        account: str,
        dataset: str,
        offset: int,
        limit: int,
    ) -> Any:
        """Fetch one page from `/api/products` after authenticating."""
        async with httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            follow_redirects=True,
        ) as client:
            headers = await self._login(client)
            response = await client.get(
                "/api/products",
                params={
                    "account": account,
                    "dataset": dataset,
                    "offset": offset,
                    "limit": limit,
                },
                headers=headers or None,
            )
            response.raise_for_status()
            return response.json()
