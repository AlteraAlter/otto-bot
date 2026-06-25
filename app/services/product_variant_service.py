"""Service layer for persisted product variants."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attributes import Attribute
from app.models.categories import Category
from app.models.category_group import CategoryGroup
from app.models.product_attributes import ProductAttributes
from app.models.product_variants import ProductVariant
from app.models.products import Product
from app.models.variation_theme import VariationTheme
from app.services.product_variation_logic import (
    VARIANT_STATUSES,
    VariationDimension,
    build_variant_combinations,
    preview_variant_generation,
    source_combination_key,
    split_attribute_values,
)


def product_snapshot(product: Product) -> dict[str, Any]:
    return {
        "id": product.id,
        "productReference": product.product_reference,
        "sku": product.sku,
        "ean": product.ean,
        "moin": product.moin,
        "productCategory": product.product_category,
        "deliveryTime": product.delivery_time,
        "price": product.price,
        "recommendedRetailPrice": product.recommended_retail_price,
        "salePrice": product.sale_price,
        "marketplaceStatus": product.marketplace_status,
        "activeStatus": product.active_status,
        "mediaAssetLinks": product.media_asset_links or [],
    }


def variant_to_dict(variant: ProductVariant) -> dict[str, Any]:
    return {
        "id": variant.id,
        "productId": variant.product_id,
        "productReference": variant.product_reference,
        "combinationKey": variant.combination_key,
        "combination": variant.variation_attributes_snapshot or [],
        "ean": variant.ean,
        "sku": variant.sku,
        "price": variant.price,
        "imagePath": variant.image_path,
        "imageUrl": variant.image_url,
        "mediaAssetLinks": variant.media_asset_links or [],
        "status": variant.status,
        "generationError": variant.generation_error,
        "source": variant.source,
        "isDeleted": variant.is_deleted,
        "createdAt": variant.created_at.isoformat() if variant.created_at else None,
        "updatedAt": variant.updated_at.isoformat() if variant.updated_at else None,
        "deletedAt": variant.deleted_at.isoformat() if variant.deleted_at else None,
    }


class ProductVariantService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_product(self, product_id: int) -> Product:
        product = await self.session.get(Product, product_id)
        if product is None:
            raise ValueError("Product not found")
        return product

    async def _get_category_group(self, product: Product) -> CategoryGroup | None:
        category_name = str(product.product_category or "").strip()
        if not category_name:
            return None

        category_stmt = (
            select(CategoryGroup)
            .join(Category, Category.group_id == CategoryGroup.id)
            .options(selectinload(CategoryGroup.attributes))
            .where(func.lower(Category.name) == category_name.casefold())
            .limit(1)
        )
        group = await self.session.scalar(category_stmt)
        if group is not None:
            return group

        group_stmt = (
            select(CategoryGroup)
            .options(selectinload(CategoryGroup.attributes))
            .where(func.lower(CategoryGroup.name) == category_name.casefold())
            .limit(1)
        )
        return await self.session.scalar(group_stmt)

    async def _load_variation_dimensions(
        self,
        product: Product,
    ) -> tuple[list[VariationDimension], list[str]]:
        group = await self._get_category_group(product)
        if group is None:
            return [], ["No category group found for product category."]

        theme_stmt = (
            select(Attribute)
            .join(VariationTheme, VariationTheme.attribute_id == Attribute.id)
            .where(VariationTheme.group_id == group.id)
            .order_by(Attribute.name.asc())
        )
        theme_attributes = (await self.session.scalars(theme_stmt)).all()
        if not theme_attributes:
            return [], ["No variation themes configured for this category group."]

        product_attributes: list[ProductAttributes] = []
        if product.sku:
            attr_stmt = select(ProductAttributes).where(
                ProductAttributes.product_sku == product.sku
            )
            product_attributes = (await self.session.scalars(attr_stmt)).all()

        values_by_name: dict[str, list[str]] = {}
        for row in product_attributes:
            key = str(row.name or "").strip().casefold()
            if not key:
                continue
            values_by_name.setdefault(key, [])
            for value in split_attribute_values(row.value):
                if value not in values_by_name[key]:
                    values_by_name[key].append(value)

        dimensions: list[VariationDimension] = []
        issues: list[str] = []
        for attribute in theme_attributes:
            values = values_by_name.get(str(attribute.name).strip().casefold(), [])
            if not values:
                issues.append(
                    f"Variation attribute '{attribute.name}' has no current value."
                )
                continue
            dimensions.append(
                VariationDimension(
                    attribute_id=str(attribute.id),
                    name=attribute.name,
                    values=tuple(values),
                )
            )
        return dimensions, issues

    async def _active_variants(self, product_id: int) -> list[ProductVariant]:
        stmt = (
            select(ProductVariant)
            .where(
                ProductVariant.product_id == product_id,
                ProductVariant.is_deleted.is_(False),
            )
            .order_by(ProductVariant.id.asc())
        )
        return list((await self.session.scalars(stmt)).all())

    async def preview(self, product_id: int) -> dict[str, Any]:
        product = await self._get_product(product_id)
        dimensions, issues = await self._load_variation_dimensions(product)
        existing = await self._active_variants(product_id)
        preview = preview_variant_generation(
            dimensions,
            [variant.combination_key for variant in existing],
        )
        preview["issues"] = issues
        preview["productId"] = product.id
        preview["productReference"] = product.product_reference
        return preview

    async def list_variants(self, product_id: int) -> dict[str, Any]:
        product = await self._get_product(product_id)
        variants = await self._active_variants(product_id)
        return {
            "productId": product.id,
            "productReference": product.product_reference,
            "items": [variant_to_dict(variant) for variant in variants],
            "total": len(variants),
        }

    async def generate(self, product_id: int) -> dict[str, Any]:
        product = await self._get_product(product_id)
        dimensions, issues = await self._load_variation_dimensions(product)
        combinations = build_variant_combinations(dimensions)
        source_key = source_combination_key(dimensions)
        existing = {
            variant.combination_key: variant
            for variant in await self._active_variants(product_id)
        }
        created: list[ProductVariant] = []
        source_materialized = False

        product_ref = product.product_reference or product.sku or product.ean
        snapshot = product_snapshot(product)
        base_media = product.media_asset_links or []
        first_image = base_media[0] if base_media else None

        for combination in combinations:
            if combination.key in existing:
                continue
            is_source = combination.key == source_key
            variant = ProductVariant(
                product_id=product.id,
                product_reference=product_ref,
                combination_key=combination.key,
                variation_attributes_snapshot=combination.as_snapshot(),
                copied_product_data_snapshot=snapshot,
                ean=product.ean if is_source else None,
                sku=product.sku if is_source else None,
                price=product.price,
                image_url=first_image,
                media_asset_links=base_media[:1] if first_image else [],
                status="ready" if is_source and product.ean and product.sku else "pending_generation",
                source="source" if is_source else "generated",
            )
            self.session.add(variant)
            await self.session.flush()
            existing[combination.key] = variant
            source_materialized = source_materialized or is_source
            if not is_source:
                created.append(variant)

        await self.session.commit()
        return {
            "productId": product.id,
            "productReference": product_ref,
            "created": len(created),
            "sourceVariantCreated": source_materialized,
            "total": len(combinations),
            "issues": issues,
            "items": [variant_to_dict(variant) for variant in existing.values()],
        }

    async def _ensure_identifier_unique(
        self,
        *,
        product_id: int,
        variant_id: int,
        field: str,
        value: str | None,
    ) -> None:
        if not value:
            return
        column = ProductVariant.sku if field == "sku" else ProductVariant.ean
        variant_stmt = select(ProductVariant.id).where(
            column == value,
            ProductVariant.id != variant_id,
            ProductVariant.is_deleted.is_(False),
        )
        if await self.session.scalar(variant_stmt):
            raise ValueError(f"{field.upper()} already exists on another variant.")

        product_column = Product.sku if field == "sku" else Product.ean
        product_stmt = select(Product.id).where(
            product_column == value,
            Product.id != product_id,
        )
        if await self.session.scalar(product_stmt):
            raise ValueError(f"{field.upper()} already exists on another product.")

    async def update_variant(
        self,
        product_id: int,
        variant_id: int,
        patch: dict[str, Any],
    ) -> dict[str, Any]:
        await self._get_product(product_id)
        variant = await self.session.get(ProductVariant, variant_id)
        if variant is None or variant.product_id != product_id or variant.is_deleted:
            raise ValueError("Variant not found")

        next_sku = patch.get("sku", variant.sku)
        next_ean = patch.get("ean", variant.ean)
        await self._ensure_identifier_unique(
            product_id=product_id,
            variant_id=variant_id,
            field="sku",
            value=str(next_sku or "").strip() or None,
        )
        await self._ensure_identifier_unique(
            product_id=product_id,
            variant_id=variant_id,
            field="ean",
            value=str(next_ean or "").strip() or None,
        )

        for key, attr in (
            ("ean", "ean"),
            ("sku", "sku"),
            ("imageUrl", "image_url"),
            ("imagePath", "image_path"),
            ("generationError", "generation_error"),
        ):
            if key in patch:
                setattr(variant, attr, str(patch[key] or "").strip() or None)

        if "price" in patch:
            raw_price = patch.get("price")
            variant.price = None if raw_price in (None, "") else float(raw_price)
        if "mediaAssetLinks" in patch and isinstance(patch["mediaAssetLinks"], list):
            variant.media_asset_links = [
                str(item).strip() for item in patch["mediaAssetLinks"] if str(item).strip()
            ]
        if "status" in patch:
            status_value = str(patch["status"] or "").strip()
            if status_value not in VARIANT_STATUSES:
                raise ValueError("Unsupported variant status")
            variant.status = status_value
        if patch.get("manualOverride") is True:
            variant.status = "manual_override"
            variant.generation_error = None
        variant.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(variant)
        return variant_to_dict(variant)

    async def delete_variant(self, product_id: int, variant_id: int) -> dict[str, Any]:
        await self._get_product(product_id)
        variant = await self.session.get(ProductVariant, variant_id)
        if variant is None or variant.product_id != product_id or variant.is_deleted:
            raise ValueError("Variant not found")
        variant.is_deleted = True
        variant.deleted_at = datetime.now(UTC)
        variant.updated_at = variant.deleted_at
        await self.session.commit()
        return {"success": True, "id": variant_id}

    async def mark_image_regeneration_queued(
        self,
        product_id: int,
        variant_id: int,
    ) -> dict[str, Any]:
        await self._get_product(product_id)
        variant = await self.session.get(ProductVariant, variant_id)
        if variant is None or variant.product_id != product_id or variant.is_deleted:
            raise ValueError("Variant not found")
        variant.status = "pending_generation"
        variant.generation_error = None
        variant.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(variant)
        return variant_to_dict(variant)


async def find_identifier_conflicts(
    session: AsyncSession,
    *,
    skus: set[str],
    eans: set[str],
) -> list[dict[str, str]]:
    """Check local DB for SKU/EAN collisions before OTTO export."""
    errors: list[dict[str, str]] = []
    if not skus and not eans:
        return errors

    product_filters = []
    if skus:
        product_filters.append(Product.sku.in_(skus))
    if eans:
        product_filters.append(Product.ean.in_(eans))
    if product_filters:
        rows = (
            await session.execute(select(Product.sku, Product.ean).where(or_(*product_filters)))
        ).all()
        for sku, ean in rows:
            if sku in skus:
                errors.append(
                    {
                        "variation": str(sku),
                        "code": "duplicate_sku",
                        "title": "SKU already exists in local products.",
                        "jsonPath": "sku",
                    }
                )
            if ean in eans:
                errors.append(
                    {
                        "variation": str(ean),
                        "code": "duplicate_ean",
                        "title": "EAN already exists in local products.",
                        "jsonPath": "ean",
                    }
                )

    variant_filters = []
    if skus:
        variant_filters.append(ProductVariant.sku.in_(skus))
    if eans:
        variant_filters.append(ProductVariant.ean.in_(eans))
    if variant_filters:
        rows = (
            await session.execute(
                select(ProductVariant.sku, ProductVariant.ean).where(
                    ProductVariant.is_deleted.is_(False),
                    or_(*variant_filters),
                )
            )
        ).all()
        for sku, ean in rows:
            if sku in skus:
                errors.append(
                    {
                        "variation": str(sku),
                        "code": "duplicate_sku",
                        "title": "SKU already exists on a local product variant.",
                        "jsonPath": "sku",
                    }
                )
            if ean in eans:
                errors.append(
                    {
                        "variation": str(ean),
                        "code": "duplicate_ean",
                        "title": "EAN already exists on a local product variant.",
                        "jsonPath": "ean",
                    }
                )
    return errors
