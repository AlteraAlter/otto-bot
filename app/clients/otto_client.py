from datetime import datetime
from typing import Any

import httpx

from app.core.otto_auth import OttoAuth


class OttoClient:
    def __init__(self, auth: OttoAuth, base_url: str, timeout: float):
        self.auth = auth
        self.base_url = base_url
        self.timeout = timeout

    async def _header(self):
        token = await self.auth.get_token()
        request_timestamp = (
            datetime.now().astimezone().isoformat(timespec="milliseconds")
        )
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Request-Timestamp": request_timestamp,
        }

    @staticmethod
    def _parse_response(response: httpx.Response):
        if response.status_code == 204 or not response.content:
            return {"status_code": response.status_code, "message": "No content"}

        content_type = response.headers.get("content-type", "").lower()
        if "application/json" in content_type:
            return response.json()

        return {
            "status_code": response.status_code,
            "content_type": content_type or None,
            "body": response.text,
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: Any = None,
    ):
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=await self._header(),
                params=params,
                json=json,
            )
            response.raise_for_status()
            return self._parse_response(response)

    async def update_status(self, payload: dict):
        return await self._request(
            "POST",
            "/v5/products/active-status",
            json=payload,
        )

    async def get_product(self, sku: str):
        return await self._request("GET", f"/v5/products/{sku}")

    async def get_products(self, payload: dict | None = None):
        return await self._request("GET", "/v5/products", params=payload)

    async def get_active_products(self, payload: dict | None = None):
        return await self._request("GET", "/v5/products/active-status", params=payload)

    async def update_tasks(self, pid: str):
        return await self._request("GET", f"/v5/products/update-tasks/{pid}")

    async def get_marketplace_status(self, payload: dict | None = None):
        return await self._request(
            "GET",
            "/v5/products/marketplace-status",
            params=payload,
        )

    async def create_or_update_products(self, payload: dict):
        return await self._request("POST", "/v5/products", json=[payload])

    async def get_categories(self, payload: dict):
        body = await self._request("GET", "/v5/products/categories", params=payload)
        if isinstance(body, dict):
            groups = body.get("categoryGroups")
            if isinstance(groups, list):
                return [
                    group.get("categoryGroup")
                    for group in groups
                    if isinstance(group, dict) and group.get("categoryGroup")
                ]
        return body
