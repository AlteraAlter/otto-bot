"""Synchronize OTTO media asset URLs into local product rows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_attributes import ProductAttributes
from app.models.products import Product
from app.services.product_service import ProductService

DESCRIPTION_ATTRIBUTE_NAME = "description"
BULLET_POINT_ATTRIBUTE_NAME = "bullet_point"


def _deduplicate_links(links: list[str]) -> list[str]:
    seen: set[str] = set()
    unique_links: list[str] = []
    for link in links:
        normalized = link.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_links.append(normalized)
    return unique_links


def extract_media_asset_links(payload: Any) -> list[str]:
    """Extract media asset URLs from an OTTO product response."""
    candidates: list[Any] = []

    if isinstance(payload, dict):
        for key in ("mediaAssets", "media_assets"):
            value = payload.get(key)
            if isinstance(value, list):
                candidates.extend(value)

        for container_key in ("product", "item", "data", "result", "content"):
            nested = payload.get(container_key)
            if isinstance(nested, dict):
                candidates.extend(extract_media_asset_links(nested))

    links: list[str] = []
    for item in candidates:
        if isinstance(item, str):
            if item.startswith(("http://", "https://")):
                links.append(item)
            continue
        if not isinstance(item, dict):
            continue

        for key in ("location", "url", "href", "src"):
            value = item.get(key)
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                links.append(value)
                break

    return _deduplicate_links(links)


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def extract_product_description_block(payload: Any) -> dict[str, Any] | None:
    """Extract the structured `productDescription` block from an OTTO response."""
    if not isinstance(payload, dict):
        return None

    product_description = payload.get("productDescription")
    if isinstance(product_description, dict):
        return product_description

    for container_key in ("product", "item", "data", "result", "content"):
        nested = payload.get(container_key)
        if isinstance(nested, dict):
            product_description = extract_product_description_block(nested)
            if product_description:
                return product_description

    return None


def _normalize_description_rows(
    *,
    sku: str,
    payload: Any,
) -> list[dict[str, str]]:
    """Build flattened rows for description text, bullet points, and attributes."""
    product_description = extract_product_description_block(payload)
    if not product_description:
        return []

    rows: list[dict[str, str]] = []

    description = _normalize_text(product_description.get("description"))
    if description:
        rows.append(
            {
                "product_sku": sku,
                "name": DESCRIPTION_ATTRIBUTE_NAME,
                "value": description,
            }
        )

    bullet_points = product_description.get("bulletPoints")
    if isinstance(bullet_points, list):
        for bullet_point in bullet_points:
            normalized_bullet_point = (
                _normalize_text(bullet_point)
                if isinstance(bullet_point, str)
                else _normalize_text(str(bullet_point)) if bullet_point is not None else None
            )
            if normalized_bullet_point:
                rows.append(
                    {
                        "product_sku": sku,
                        "name": BULLET_POINT_ATTRIBUTE_NAME,
                        "value": normalized_bullet_point,
                    }
                )

    attributes = product_description.get("attributes")
    if isinstance(attributes, list):
        for attribute in attributes:
            if not isinstance(attribute, dict):
                continue
            name = _normalize_text(attribute.get("name"))
            values = attribute.get("values")
            if not name or not isinstance(values, list):
                continue

            for value in values:
                normalized_value = (
                    _normalize_text(value)
                    if isinstance(value, str)
                    else _normalize_text(str(value)) if value is not None else None
                )
                if normalized_value:
                    rows.append(
                        {
                            "product_sku": sku,
                            "name": name,
                            "value": normalized_value,
                        }
                    )

    return rows


async def _replace_product_description_rows(
    *,
    db: AsyncSession,
    sku: str,
    description_rows: list[dict[str, str]],
) -> bool:
    """Replace all flattened description rows for a SKU."""
    result = await db.execute(
        select(ProductAttributes.name, ProductAttributes.value)
        .where(ProductAttributes.product_sku == sku)
        .order_by(ProductAttributes.id.asc())
    )
    current_values = [
        (name, value)
        for name, value in result.all()
        if _normalize_text(name) and _normalize_text(value)
    ]
    next_values = [(row["name"], row["value"]) for row in description_rows]

    if current_values == next_values:
        return False

    await db.execute(delete(ProductAttributes).where(ProductAttributes.product_sku == sku))
    if description_rows:
        await db.execute(insert(ProductAttributes).values(description_rows))
    return True


@dataclass
class ProductMediaSyncResult:
    scanned_products: int
    updated_products: int
    skipped_products: int


async def sync_product_media_assets(
    *,
    db: AsyncSession,
    product_service: ProductService,
    sku: str | None = None,
    limit: int | None = None,
    only_missing: bool = False,
    print_status_codes: bool = False,
) -> ProductMediaSyncResult:
    """Fetch OTTO product media assets and descriptions by SKU and persist per request."""
    stmt = select(Product).where(Product.sku.is_not(None)).order_by(Product.id.asc())

    if sku:
        stmt = stmt.where(Product.sku == sku)
    if only_missing:
        description_exists = (
            select(ProductAttributes.id)
            .where(ProductAttributes.product_sku == Product.sku)
            .where(ProductAttributes.name == DESCRIPTION_ATTRIBUTE_NAME)
            .exists()
        )
        stmt = stmt.where(
            or_(
                Product.media_asset_links.is_(None),
                func.cardinality(Product.media_asset_links) == 0,
                ~description_exists,
            )
        )
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    products = result.scalars().all()

    updated_products = 0
    skipped_products = 0

    for product in products:
        if not product.sku:
            skipped_products += 1
            continue

        try:
            status_code, otto_product = await product_service.get_product_with_status(product.sku)
            if print_status_codes:
                print(
                    f"[sync_product_media_assets] sku={product.sku} status={status_code}",
                    flush=True,
                )
            if status_code < 200 or status_code >= 300:
                skipped_products += 1
                continue

            media_asset_links = extract_media_asset_links(otto_product)
            description_rows = _normalize_description_rows(
                sku=product.sku,
                payload=otto_product,
            )
            media_changed = media_asset_links != (product.media_asset_links or [])
            description_changed = await _replace_product_description_rows(
                db=db,
                sku=product.sku,
                description_rows=description_rows,
            )

            if media_changed:
                product.media_asset_links = media_asset_links

            if not media_changed and not description_changed:
                skipped_products += 1
                continue

            await db.commit()
            updated_products += 1
        except Exception as exc:
            await db.rollback()
            if print_status_codes:
                print(
                    f"[sync_product_media_assets] sku={product.sku} error={exc}",
                    flush=True,
                )
            skipped_products += 1
            continue

    return ProductMediaSyncResult(
        scanned_products=len(products),
        updated_products=updated_products,
        skipped_products=skipped_products,
    )
