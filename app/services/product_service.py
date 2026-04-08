"""Thin service layer around OTTO client operations.

This class intentionally keeps business logic minimal. It exists to provide a
stable dependency boundary for routes and higher-level workflows while keeping
the HTTP implementation isolated inside `OttoClient`.
"""

from typing import Any

from app.clients.otto_client import OttoClient


class ProductService:
    """Coordinate product-related calls to OTTO-facing client methods."""

    def __init__(self, client: OttoClient):
        """Initialize service with an already configured OTTO client."""
        self.client = client

    async def get_product(self, sku: str):
        """Fetch one product from OTTO by SKU."""
        return await self.client.get_product(sku)

    async def get_product_with_status(self, sku: str):
        """Fetch one product from OTTO by SKU and include the upstream status code."""
        return await self.client.get_product_with_status(sku)

    async def get_products(self, payload: dict):
        """Fetch paginated products from OTTO using query payload filters."""
        return await self.client.get_products(payload)

    async def get_active_products(self, payload: dict):
        """Fetch active-status listing from OTTO."""
        return await self.client.get_active_products(payload)

    async def update_tasks(self, pid: str):
        """Trigger backend update tasks for a given OTTO product id."""
        return await self.client.update_tasks(pid)

    async def get_marketplace_status(self, payload: dict):
        """Fetch marketplace status information for products from OTTO."""
        return await self.client.get_marketplace_status(payload)

    async def create_or_update_products(self, payload: list[dict[str, Any]]):
        """Create or upsert products in OTTO with normalized payload bodies."""
        return await self.client.create_or_update_products(payload)

    async def update_status(self, payload: dict):
        """Update active flags/status for one or more products in OTTO."""
        return await self.client.update_status(payload)

    async def get_categories(self, payload: dict):
        """Fetch category information from OTTO, normalized by the client."""
        return await self.client.get_categories(payload)
