"""HTTP client for OTTO product endpoints with token-based authentication.

The client centralizes request headers, response parsing, and endpoint paths so
service classes can focus on orchestration instead of transport details.
"""

from datetime import datetime
from typing import Any

import httpx

from app.core.otto_auth import OttoAuth


class OttoClient:
    """Low-level async client for calling OTTO product APIs."""

    def __init__(self, auth: OttoAuth, base_url: str, timeout: float):
        """Store auth provider and HTTP connection settings."""
        self.auth = auth
        self.base_url = base_url
        self.timeout = timeout

    async def _header(self):
        """Build authenticated headers required by OTTO endpoints."""
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
        """Normalize HTTP responses to a consistent Python shape.

        JSON responses are returned as decoded objects, while empty/non-JSON
        responses are wrapped into explicit dictionaries to avoid downstream
        ambiguity.
        """
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
        """Execute an authenticated HTTP request and raise on non-2xx responses."""
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
        """POST active status changes for products."""
        return await self._request(
            "POST",
            "/v5/products/active-status",
            json=payload,
        )

    async def get_product(self, sku: str):
        """GET a single product by SKU."""
        return await self._request("GET", f"/v5/products/{sku}")

    async def get_products(self, payload: dict | None = None):
        """GET paginated products list."""
        return await self._request("GET", "/v5/products", params=payload)

    async def get_active_products(self, payload: dict | None = None):
        """GET active-status list."""
        return await self._request("GET", "/v5/products/active-status", params=payload)

    async def update_tasks(self, pid: str):
        """Trigger update tasks for a product-processing identifier."""
        return await self._request("GET", f"/v5/products/update-tasks/{pid}")

    async def get_marketplace_status(self, payload: dict | None = None):
        """GET marketplace status information with optional filters."""
        return await self._request(
            "GET",
            "/v5/products/marketplace-status",
            params=payload,
        )

    async def create_or_update_products(self, payload: list[dict[str, Any]]):
        """POST product payloads for create/upsert operations."""
        return await self._request("POST", "/v5/products", json=payload)

    async def get_categories(self, payload: dict):
        """Fetch and flatten category values from OTTO category-group responses."""
        body = await self._request("GET", "/v5/products/categories", params=payload)
        if isinstance(body, dict):
            groups = body.get("categoryGroups")
            if isinstance(groups, list):
                categories: list[str] = []
                for group in groups:
                    if not isinstance(group, dict):
                        continue
                    group_categories = group.get("categories")
                    if not isinstance(group_categories, list):
                        continue
                    for item in group_categories:
                        if isinstance(item, str) and item.strip():
                            categories.append(item.strip())
                            continue
                        if isinstance(item, dict):
                            for key in ("category", "name", "label", "categoryName"):
                                value = item.get(key)
                                if isinstance(value, str) and value.strip():
                                    categories.append(value.strip())
                                    break
                if categories:
                    return list(dict.fromkeys(categories))
        return body
