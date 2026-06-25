"""Thin service layer around OTTO client operations.

This class intentionally keeps business logic minimal. It exists to provide a
stable dependency boundary for routes and higher-level workflows while keeping
the HTTP implementation isolated inside `OttoClient`.
"""

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.otto_client import OttoClient
from app.core.configs import settings
from app.core.logger import logging
from app.models.attribute_allowed_values import AttributeAllowedValue
from app.models.attributes import Attribute
from app.models.categories import Category
from app.models.category_group import CategoryGroup
from app.models.variation_theme import VariationTheme
from app.normalize_product_to_schema import brand_id_for_controller
from app.schemas.enums import Controller

# Schemas
from app.schemas.product import (
    Availability,
    AvailabilityRequest,
    CreateProductRequest,
    Product,
    ProductBase,
    ProductClient,
    ProductResponse,
    UpdateProductDelivery,
    UpdateQuantity,
)
from app.schemas.product_response import (
    AvailabilityResponse,
    CategoryGroupSchema,
    DeleteProductResponse,
    OperationResult,
    OttoCategoryResponse,
    ProductCreateResponse,
    UpdateProductDeliveryResponse,
    UpdateQuantityResponse,
)
from app.services.utility_service import UtilityService
from app.utils.helpers import to_json


class ProductService:
    """Coordinate product-related calls to OTTO-facing client methods."""

    def __init__(self, client: OttoClient):
        self.client = client
        self.logger = logging.getLogger(__name__)

    async def get_product(self, sku: str):
        """Fetch one product from OTTO by SKU."""
        return await self.client.get_product(sku)

    async def get_product_with_status(self, sku: str):
        """Fetch one product from OTTO by SKU and include the upstream status code."""
        return await self.client.get_product_with_status(sku)

    async def get_products(
        self,
        payload: dict,
        controller: Controller = Controller.JV,
    ) -> ProductResponse:
        """Fetch paginated products from OTTO using query payload filters."""
        return await self.client.get_products(payload, controller=controller)

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

    async def create_or_update_products(
        self, payload: CreateProductRequest
    ) -> ProductCreateResponse:
        """Create or upsert products in OTTO with normalized payload bodies."""
        compliance = settings.compliance.get(payload.controller)

        products = []
        brand_id = brand_id_for_controller(payload.controller)

        for item in payload.products:
            product_data = item.model_dump()
            product_description = dict(product_data.get("productDescription") or {})
            product_description["brandId"] = brand_id
            product_data["productDescription"] = product_description
            product = ProductClient(**product_data, compliance=compliance)
            products.append(product)

            print(f"Product client body: {product}")

        otto_payload = ProductBase(products)

        return await self.client.create_or_update_products(
            otto_payload, controller=payload.controller
        )

    async def update_status(
        self,
        payload: dict,
        controller: Controller = Controller.JV,
    ):
        """Update active flags/status for one or more products in OTTO."""
        return await self.client.update_status(payload, controller=controller)

    async def get_categories(self, payload: dict):
        """Fetch category information from OTTO, normalized by the client."""

        return await self.client.get_categories(payload)

    async def update_quantity(
        self, payload: Optional[dict | list], controller: Controller = Controller.JV
    ):
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
        self.logger.info(
            "step=create_availability_start sku=%s quantity=%s shipping_profile_id=%s processing_time=%s controller=%s",
            payload.sku,
            payload.quantity or "20",
            payload.shippingProfileID,
            payload.processingTime or "DEFAULT",
            payload.controller.value
            if isinstance(payload.controller, Controller)
            else payload.controller,
        )

        quantity_payload = UpdateQuantity(
            sku=payload.sku, quantity=payload.quantity or "20"
        )

        delivery_payload = UpdateProductDelivery(
            sku=payload.sku,
            processingTime=payload.processingTime or "DEFAULT",
            shippingProfileId=payload.shippingProfileID,
        )

        try:
            self.logger.info(
                "step=create_availability_quantity_request sku=%s payload=%s",
                payload.sku,
                quantity_payload.model_dump(mode="json", by_alias=True),
            )
            await self.update_quantity(
                quantity_payload.model_dump(
                    mode="json",
                    by_alias=True,
                ),
                controller=payload.controller,
            )
            quantity_result: OperationResult | Exception = OperationResult(success=True)
            self.logger.info(
                "step=create_availability_quantity_success sku=%s",
                payload.sku,
            )
        except Exception as exc:
            quantity_result = exc
            self.logger.exception(
                "step=create_availability_quantity_failed sku=%s error=%s",
                payload.sku,
                exc,
            )

        try:
            self.logger.info(
                "step=create_availability_delivery_request sku=%s payload=%s",
                payload.sku,
                delivery_payload.model_dump(mode="json", by_alias=True),
            )
            await self.update_product_delivery_information(
                delivery_payload.model_dump(
                    mode="json",
                    by_alias=True,
                ),
                controller=payload.controller,
            )
            delivery_result: OperationResult | Exception = OperationResult(success=True)
            self.logger.info(
                "step=create_availability_delivery_success sku=%s shipping_profile_id=%s",
                payload.sku,
                payload.shippingProfileID,
            )
        except Exception as exc:
            delivery_result = exc
            self.logger.exception(
                "step=create_availability_delivery_failed sku=%s shipping_profile_id=%s error=%s",
                payload.sku,
                payload.shippingProfileID,
                exc,
            )

        if isinstance(quantity_result, Exception):
            quantity_result = OperationResult(
                success=False, errors=str(quantity_result)
            )

        if isinstance(delivery_result, Exception):
            delivery_result = OperationResult(
                success=False, errors=str(delivery_result)
            )

        response = AvailabilityResponse(
            update_quantity=quantity_result, update_delivery=delivery_result
        )
        self.logger.info(
            "step=create_availability_done sku=%s quantity_success=%s delivery_success=%s quantity_errors=%s delivery_errors=%s",
            payload.sku,
            response.update_quantity.success if response.update_quantity else None,
            response.update_delivery.success if response.update_delivery else None,
            response.update_quantity.errors if response.update_quantity else None,
            response.update_delivery.errors if response.update_delivery else None,
        )
        return response

    async def delete_product_from_file(
        self, skus: list[str], controller: Controller
    ) -> DeleteProductResponse:
        """
        Reference:
            https://www.otto.de/p/jvmoebel-weinschrank-weinschrank-mit-kuehlschrankfunktion-und-flaschenregal-1-st-made-in-europe-S0CFH0N8/
        """
        # Reading a file

        date = datetime.now().strftime("%d-%m-%Y")

        util = UtilityService()
        quantity_payload: list[UpdateQuantity] = []
        products: list[Product] = []

        for sku in skus:
            quantity_payload.append(UpdateQuantity(sku=sku, quantity="0"))

            # Get product payload
            product_variation_response: ProductResponse = await self.get_products(
                {"sku": sku}
            )
            product_variation = product_variation_response.productVariations[0]
            product_variation.productDescription.productLine = f"DELETED_{date}"
            products.append(
                Product.model_validate(**product_variation.model_dump(mode="json"))
            )

        # Requests
        product_create_payload = CreateProductRequest(
            controller=controller, products=products
        )
        print(products)
        product_task = self.create_or_update_products(product_create_payload)
        quantity_task = self.client.update_quantity(
            payload=[item.model_dump(mode="json") for item in quantity_payload],
            controller=controller,
        )

        product_result, quantity_result = await asyncio.gather(
            product_task,
            quantity_task,
            return_exceptions=True,
        )

        product_operation = OperationResult()
        quantity_operation = OperationResult()

        if isinstance(product_result, Exception):
            product_operation.errors = str(product_result)
            return DeleteProductResponse(product_operation=product_operation)

        else:
            product_operation.success = True

        if isinstance(quantity_result, Exception):
            quantity_operation.errors = str(quantity_result)
            return DeleteProductResponse(
                product_operation=product_operation,
                quantity_operation=quantity_operation,
            )

        else:
            quantity_operation.success = True

        return DeleteProductResponse(
            product_operation=product_operation, quantity_operation=quantity_operation
        )

    async def fetch_all_categories_to_db(self, session: AsyncSession):
        """Фетчит все категории из ОТТО и сохраняет в БД"""

        self.logger.info("Started category synchronization")

        MAX_FETCH_SIZE = 10
        page = 0

        existing_groups: dict[str, CategoryGroup] = {
            group.name: group
            for group in (await session.scalars(select(CategoryGroup))).all()
        }

        self.logger.info(
            "Loading existing category groups", extra={"count": len(existing_groups)}
        )
        while True:
            try:
                self.logger.info(f"Fetching page {page}")

                otto_response = await self.client.get_categories(
                    {"page": page, "limit": MAX_FETCH_SIZE}
                )

                if not otto_response.categoryGroups:
                    self.logger.info("Category groups not found")
                    break

                for group_item in otto_response.categoryGroups:
                    # Создает родительскую категорию
                    category_group = existing_groups.get(group_item.categoryGroup)

                    if not category_group:
                        category_group = CategoryGroup(name=group_item.categoryGroup)
                        session.add(category_group)
                        self.logger.info(
                            f"Created category group: {category_group.name}"
                        )

                    else:
                        self.logger.debug(
                            f"Skipping existing category group: {category_group.name}"
                        )
                        continue

                    # =====================
                    # Categories
                    # =====================
                    self.logger.info(
                        f"Start saving the categories: {group_item.categories}"
                    )
                    for category_name in group_item.categories:
                        category = Category(group=category_group, name=category_name)
                        session.add(category)
                        self.logger.debug(
                            f"INSERT category: {category.name} to group {category_group.name}"
                        )

                    # =====================
                    # Attributes
                    # =====================
                    self.logger.info(
                        f"Start saving attributes: {group_item.attributes}"
                    )
                    for attr_item in group_item.attributes:
                        attribute = Attribute(
                            group=category_group,
                            name=attr_item.name,
                            type=attr_item.type,
                            description=attr_item.description,
                            relevance=attr_item.relevance.value
                            if attr_item.relevance
                            else None,
                            multi_value=attr_item.multiValue,
                            unit=attr_item.unit,
                        )
                        session.add(attribute)
                        self.logger.debug(
                            f"INSERT attribute: {attribute.name} to group {category_group.name}"
                        )

                        # =====================
                        # Allowed values
                        # =====================
                        self.logger.info(
                            f"Start saving allowed values for attribute: {attribute.name}"
                        )
                        for item_allowed_value in attr_item.allowedValues:
                            allowed_val = AttributeAllowedValue(
                                attribute=attribute, value=item_allowed_value
                            )
                            session.add(allowed_val)
                            self.logger.debug(
                                f"INSERT {allowed_val.value} into {attribute.name} with group: {category_group.name}"
                            )

                        # =====================
                        # Variation Themes
                        # =====================
                        self.logger.info(
                            f"Start saving Variation Themes: {group_item.variationThemes}"
                        )
                        if attr_item.name in group_item.variationThemes:
                            variation_theme = VariationTheme(
                                group=category_group, attribute=attribute
                            )
                            session.add(variation_theme)
                            self.logger.debug(
                                f"INSERT {attr_item.name} into {attribute.name} with group: {category_group.name}"
                            )

                    existing_groups[category_group.name] = category_group
                await session.commit()
                self.logger.info(f"Committed page{page}")

            except Exception:
                self.logger.exception(
                    "Failed category synchronization. Rolling back INSERTS"
                )
                await session.rollback()

            page += 1

        self.logger.info("Completed the fetch saving of category groups from OTTO")


async def main(): ...
