import hashlib
from copy import deepcopy
from typing import Any

from app.clients.external_otto_client import ExternalOttoClient
from app.models.attribute_allowed_values import AttributeAllowedValue
from app.models.attributes import Attribute
from app.models.categories import Category
from app.models.category_group import CategoryGroup
from app.schemas.external_schemes.until_schemes import (
    ActiveStatusByEanRequest,
    ActiveStatusByEanResponse,
    CreateOrUpdateProductVariationRequest,
    GetProductRequest,
    ShippingProfileResponse,
)
from app.schemas.product_response import (
    AttributeSchema,
    ExternalCategoryItem,
    ExternalCategoriesResponse,
    ExternalCategoryAttributesResponse,
    OttoCategoryResponse,
)
from app.repository.external_api_repository import ExternalApiRepository
from app.schemas.enums import Controller
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

EXTERNAL_PRODUCT_BRAND_ID_BY_CONTROLLER: dict[str, str] = {
    "jv": "UO4EGHSX",
    "xl": "6HMOZBOU",
}


EXTERNAL_PRODUCT_COMPLIANCE_BY_CONTROLLER: dict[str, dict[str, Any]] = {
    "jv": {
        "productSafety": {
            "addresses": [
                {
                    "name": "AEA GmbH & Co. KG",
                    "address": "Am Flugplatz 28, 88483 Burgrieden",
                    "regionCode": "DE",
                    "roles": ["DISTRIBUTOR"],
                    "email": "info@jvmoebel.de",
                    "phone": "07392 - 93 78 44 0",
                    "url": "https://www.jvmoebel.de/Infos/Kontakt.htm",
                    "components": [],
                }
            ]
        }
    },
    "xl": {
        "productSafety": {
            "addresses": [
                {
                    "name": "DEFAULT",
                    "address": "DEFAUL",
                    "regionCode": "DE",
                    "roles": ["DISTRIBUTOR"],
                    "email": "info@xlmoebel.de",
                    "phone": "07392 - 93 78 44 0",
                    "url": "https://www.xlmoebel.de/Infos/Kontakt.htm",
                    "components": [],
                }
            ]
        }
    },
}


def _process_uvp(price: float) -> float:
    if price > 5000:
        value = price * 1.10
    elif 2500 <= price <= 4999:
        value = price * 1.18
    elif 1000 <= price <= 2499:
        value = price * 1.25
    else:
        value = price * 1.35
    return round(value, 2)


class ExternalService:

    def __init__(self, client: ExternalOttoClient):
        self.client = client

    async def get_products(self, payload: GetProductRequest, controller: str):
        data = await self.client.get_products(payload, controller)
        return data

    async def create_or_update_product(
        self, payload: CreateOrUpdateProductVariationRequest, controller: str
    ):
        prepared_payload = self._prepare_create_or_update_payload(payload, controller)
        data = await self.client.create_or_update_product(prepared_payload, controller)
        return data

    def _prepare_create_or_update_payload(
        self,
        payload: CreateOrUpdateProductVariationRequest,
        controller: str,
    ) -> list[dict[str, Any]]:
        brand_id = EXTERNAL_PRODUCT_BRAND_ID_BY_CONTROLLER[controller]
        compliance_payload = EXTERNAL_PRODUCT_COMPLIANCE_BY_CONTROLLER[controller]

        products = payload.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
        )
        for product in products:
            product_description = dict(product.get("productDescription") or {})
            product_description["brandId"] = brand_id
            product["productDescription"] = product_description
            product["compliance"] = deepcopy(compliance_payload)
            self._apply_msrp(product)

        return products

    @staticmethod
    def _apply_msrp(product: dict[str, Any]) -> None:
        pricing = product.get("pricing")
        if not isinstance(pricing, dict):
            return

        standard_price = pricing.get("standardPrice")
        if not isinstance(standard_price, dict):
            return

        amount = standard_price.get("amount")
        if amount is None:
            return

        price = float(amount)
        pricing["msrp"] = {
            "amount": _process_uvp(price),
            "currency": standard_price.get("currency") or "EUR",
        }

    async def set_active_status_by_ean(
        self,
        payload: ActiveStatusByEanRequest,
        active: bool,
    ):
        ean = payload.ean.strip()
        controller = payload.controller.value
        products = await self.client.get_products(
            GetProductRequest(ean=ean, page=0, limit=1),
            controller,
        )
        sku = self._sku_for_ean(products, ean)
        if not sku:
            return ActiveStatusByEanResponse(
                success=False,
                ean=ean,
                active=active,
                controller=payload.controller,
                status_code=404,
                message="Product was not found by EAN",
                response=products,
            )

        status_code, response = await self.client.update_active_status(
            {"status": [{"sku": sku, "active": active}]},
            controller,
        )
        success = status_code == 202
        return ActiveStatusByEanResponse(
            success=success,
            ean=ean,
            sku=sku,
            active=active,
            controller=payload.controller,
            status_code=status_code,
            message=(
                "Active status update was accepted by OTTO"
                if success
                else "Active status update was rejected by OTTO"
            ),
            response=response,
        )

    async def get_shipping_profiles(
        self,
        controller: str,
        # repository: ExternalApiRepository
    ):

        # NOTE: Сдесь получает с самого ОТТО
        data = await self.client.get_shipping_profiles(controller)
        shipping_profiles = ShippingProfileResponse.model_validate(data["results"])

        # NOTE: Сдесь запрос для записи в базу
        # await repository.create_shipping_profile(shipping_profiles)

        return shipping_profiles

    async def get_categories(
        self,
        payload: dict,
        controller: str,
        session: AsyncSession | None = None,
    ):
        if session is not None:
            local_categories = await self._get_local_categories(payload, session)
            if local_categories.categories:
                return local_categories

        category_response = await self._get_category_response(payload, controller)
        categories: list[ExternalCategoryItem] = []
        seen_categories: set[str] = set()
        category_ids_by_name = {}
        for group in category_response.categoryGroups:
            for category in group.categories:
                normalized = str(category or "").strip()
                if normalized and normalized not in seen_categories:
                    seen_categories.add(normalized)
                    category_id = category_ids_by_name.get(
                        normalized.casefold()
                    ) or self._stable_int_id("category", normalized)
                    categories.append(
                        ExternalCategoryItem(
                            categoryId=category_id,
                            name=normalized,
                        )
                    )

        return ExternalCategoriesResponse(categories=categories)

    async def get_category_attributes(
        self,
        category_id: int,
        controller: str,
        session: AsyncSession | None = None,
    ):
        if session is not None and self._is_db_int_id(category_id):
            local_attributes = await self._get_local_category_attributes_by_id(
                category_id, session
            )
            if local_attributes.attributes:
                return local_attributes

        category_response = await self._get_category_response(
            {"page": 0, "limit": 2000}, controller
        )
        category = self._category_name_for_id(category_response, category_id)
        if not category:
            return ExternalCategoryAttributesResponse(attributes=[])

        normalized_category = category.strip().casefold()
        attributes: list[AttributeSchema] = []
        seen_attributes: set[str] = set()
        matching_group_names: list[str] = []

        for group in category_response.categoryGroups:
            group_categories = {
                str(item or "").strip().casefold()
                for item in group.categories
                if str(item or "").strip()
            }
            if normalized_category not in group_categories:
                continue
            matching_group_names.append(group.categoryGroup)

        attribute_ids_by_group_and_name = {}

        for group in category_response.categoryGroups:
            if group.categoryGroup not in matching_group_names:
                continue
            for attribute in group.attributes:
                normalized_name = attribute.name.strip().casefold()
                if normalized_name and normalized_name not in seen_attributes:
                    seen_attributes.add(normalized_name)
                    attribute_id = attribute_ids_by_group_and_name.get(
                        (group.categoryGroup.casefold(), normalized_name)
                    ) or self._stable_int_id(
                        "attribute",
                        group.categoryGroup,
                        attribute.name,
                    )
                    attributes.append(
                        attribute.model_copy(
                            update={
                                "id": attribute_id,
                                "attributeId": attribute_id,
                                "attributeKey": (
                                    str(attribute_id)
                                    if attribute_id is not None
                                    else None
                                ),
                            }
                        )
                    )

        return ExternalCategoryAttributesResponse(attributes=attributes)

    async def _get_category_response(
        self,
        payload: dict,
        controller: str,
    ):
        data = await self.client.get_categories(payload, controller)
        if isinstance(data, list):
            data = {"categoryGroups": data}
        return OttoCategoryResponse.model_validate(data)

    async def _get_local_categories(
        self,
        payload: dict,
        session: AsyncSession,
    ):
        page = max(0, int(payload.get("page") or 0))
        limit = max(0, int(payload.get("limit") or 10))
        category = str(payload.get("category") or "").strip()
        stmt = select(Category).order_by(Category.name.asc())
        if category:
            stmt = stmt.where(Category.name.ilike(f"%{category}%"))
        if limit:
            stmt = stmt.offset(page * limit).limit(limit)

        rows = (await session.scalars(stmt)).all()
        return ExternalCategoriesResponse(
            categories=[
                ExternalCategoryItem(
                    categoryId=item.id,
                    name=item.name,
                )
                for item in rows
                if item.name
            ]
        )

    async def _get_local_category_attributes_by_id(
        self,
        category_id: int,
        session: AsyncSession,
    ):
        if not category_id:
            return ExternalCategoryAttributesResponse(attributes=[])

        stmt = (
            select(CategoryGroup)
            .join(Category)
            .options(
                selectinload(CategoryGroup.attributes).selectinload(
                    Attribute.allowed_values
                )
            )
            .where(Category.id == category_id)
            .order_by(CategoryGroup.name.asc())
        )
        group = (await session.scalars(stmt)).unique().first()
        if group is None:
            return ExternalCategoryAttributesResponse(attributes=[])

        attributes = [
            AttributeSchema(
                attributeId=attr.id,
                attributeKey=str(attr.id),
                name=attr.name,
                type=attr.type,
                attributeGroup=attr.attribute_group,
                description=attr.description,
                relevance=attr.relevance,
                featureRelevance=list(attr.feature_relevance or []),
                multiValue=attr.multi_value,
                unit=attr.unit or "",
                unitDisplayName=attr.unit_display_name,
                allowedValues=sorted(
                    {item.value for item in attr.allowed_values if item.value},
                    key=str.casefold,
                ),
            )
            for attr in sorted(group.attributes, key=lambda item: item.name.casefold())
            if attr.name
        ]
        return ExternalCategoryAttributesResponse(attributes=attributes)

    def _category_name_for_id(
        self,
        category_response: OttoCategoryResponse,
        category_id: int,
    ) -> str | None:
        for group in category_response.categoryGroups:
            for category in group.categories:
                normalized = str(category or "").strip()
                if not normalized:
                    continue
                if self._stable_int_id("category", normalized) == category_id:
                    return normalized
        return None

    @staticmethod
    def _stable_int_id(*parts: str) -> int:
        payload = ":".join(str(part or "").strip().casefold() for part in parts)
        digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()
        return int(digest[:12], 16)

    @staticmethod
    def _is_db_int_id(value: int) -> bool:
        return 0 < value <= 2_147_483_647

    @staticmethod
    def _product_variations(data: object) -> list[dict]:
        if not isinstance(data, dict):
            return []

        variations = data.get("productVariations")
        if isinstance(variations, list):
            return [item for item in variations if isinstance(item, dict)]

        results = data.get("results")
        if isinstance(results, dict):
            variations = results.get("productVariations")
            if isinstance(variations, list):
                return [item for item in variations if isinstance(item, dict)]
        if isinstance(results, list):
            return [item for item in results if isinstance(item, dict)]

        return []

    @classmethod
    def _sku_for_ean(cls, data: object, ean: str) -> str | None:
        variations = cls._product_variations(data)
        if not variations:
            return None

        for item in variations:
            item_ean = str(item.get("ean") or item.get("EAN") or "").strip()
            sku = str(item.get("sku") or item.get("SKU") or "").strip()
            if sku and item_ean == ean:
                return sku

        first_sku = str(
            variations[0].get("sku") or variations[0].get("SKU") or ""
        ).strip()
        return first_sku or None
