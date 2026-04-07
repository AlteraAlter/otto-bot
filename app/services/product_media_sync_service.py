"""Synchronize OTTO media asset URLs into local product rows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.products import Product
from app.services.product_service import ProductService


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
) -> ProductMediaSyncResult:
    """Fetch OTTO product media assets by local SKU and persist them."""
    stmt = select(Product).where(Product.sku.is_not(None)).order_by(Product.id.asc())

    if sku:
        stmt = stmt.where(Product.sku == sku)
    if only_missing:
        stmt = stmt.where(
            or_(
                Product.media_asset_links.is_(None),
                func.cardinality(Product.media_asset_links) == 0,
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
            otto_product = await product_service.get_product(product.sku)
        except Exception:
            skipped_products += 1
            continue
        media_asset_links = extract_media_asset_links(otto_product)

        if media_asset_links == (product.media_asset_links or []):
            skipped_products += 1
            continue

        product.media_asset_links = media_asset_links
        updated_products += 1
        await db.flush()

    await db.commit()
    return ProductMediaSyncResult(
        scanned_products=len(products),
        updated_products=updated_products,
        skipped_products=skipped_products,
    )
