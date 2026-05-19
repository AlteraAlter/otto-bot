"""Thin service layer around OTTO client operations.

This class intentionally keeps business logic minimal. It exists to provide a
stable dependency boundary for routes and higher-level workflows while keeping
the HTTP implementation isolated inside `OttoClient`.
"""

import asyncio
from typing import Any
from pydantic import ValidationError
from app.clients.otto_client import OttoClient

from app.utils.helpers import to_json

from app.core.configs import settings

# Schemas
from app.models.products import Product
from app.schemas.product import (
    CreateProductRequest,
    ProductClient,
    ProductBase,
    Availability,
    UpdateQuantity,
    UpdateProductDelivery
)
from app.schemas.product_response import (
    UpdateQuantityResponse,
    UpdateProductDeliveryResponse,
    OperationResult,
    AvailabilityResponse,
)
from app.schemas.enums import Controller


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

    async def update_tasks(self, pid: str, controller: Controller = Controller.JV):
        """Trigger backend update tasks for a given OTTO product id."""
        return await self.client.update_tasks(pid, controller=controller)
    
    async def failed_tasks(self, pid: str, controller: Controller = Controller.JV):
        return await self.client.failed_tasks(pid, controller=controller)

    async def get_marketplace_status(self, payload: dict):
        """Fetch marketplace status information for products from OTTO."""
        return await self.client.get_marketplace_status(payload)


    async def create_or_update_products(self, payload: CreateProductRequest):
        """Create or upsert products in OTTO with normalized payload bodies."""
        compliance = settings.compliance.get(payload.controller)
        
        products = []
        
        for item in payload.products:
            product = ProductClient(
                **item.model_dump(),
                compliance=compliance
            )
            products.append(product)
            
            print(f"Product client body: {product}")
        
        otto_payload = ProductBase(products)
        
        return await self.client.create_or_update_products(
            otto_payload, controller=payload.controller
        )


    async def update_status(self, payload: dict):
        """Update active flags/status for one or more products in OTTO."""
        return await self.client.update_status(payload)


    async def get_categories(self, payload: dict, controller: Controller = Controller.JV):
        """Fetch category information from OTTO, normalized by the client."""
        return await self.client.get_categories(payload, controller=controller)
    
    
    async def update_quantity(self, payload: dict, controller: Controller = Controller.JV):
        """Upload or create quantity for sku(product)"""
        return await self.client.update_quantity(payload, controller=controller)
    
    
    async def update_product_delivery_information(
        self, payload: dict, controller: Controller = Controller.JV
    ):
        """Create or update shipping profile for products"""
        return await self.client.update_product_delivery_information(
            payload, controller=controller
        )
    
    
    async def get_shipping_profiles(self, controller: Controller = Controller.JV):
        """Fetch all product delivary info from partner(us)"""
        return await self.client.get_shipping_profiles(controller=controller)
    
    
    # Post creation of product data process
    async def create_availability(self, payload: Availability) -> AvailabilityResponse:

        quantity_payload = UpdateQuantity(
            sku=payload.sku,
            quantity=payload.quantity or "20"
        )

        delivery_payload = UpdateProductDelivery(
            sku=payload.sku, 
            processingTime=payload.processingTime or "DEFAULT", 
            shippingProfileId=payload.shippingProfileID
        )
        
        # Tasks
        quantity_task = self.update_quantity(
            quantity_payload.model_dump(
                mode="json",
                by_alias=True,
            ),
            controller=payload.controller,
        )
        delivery_task = self.update_product_delivery_information(
            delivery_payload.model_dump(
                mode="json",
                by_alias=True,
            ),
            controller=payload.controller,
        )
        quantity_result, delivery_result = await asyncio.gather(
            quantity_task,
            delivery_task,
            return_exceptions=True
        )
        
        if isinstance(quantity_result, Exception):
            quantity_result = OperationResult(success=False, errors=str(quantity_result))

        else:
            quantity_result = OperationResult(success=True)
        
        if isinstance(delivery_result, Exception):
            delivery_result = OperationResult(success=False, errors=str(delivery_result))

        else:
            delivery_result = OperationResult(success=True)
        
        return AvailabilityResponse(update_quantity=quantity_result, update_delivery=delivery_result)
