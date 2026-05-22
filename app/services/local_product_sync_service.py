"""Persist OTTO create payloads into local `products` table."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import or_, select

from app.database import SessionLocal
from app.models.products import Product


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return str(value)


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", ".")
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(cleaned)
            return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
        except ValueError:
            return None
    return None


def _payload_to_local_row(payload: dict[str, Any]) -> dict[str, Any]:
    product_description = payload.get("productDescription")
    pricing = payload.get("pricing")
    sale = pricing.get("sale") if isinstance(pricing, dict) else None
    sale_price = sale.get("salePrice") if isinstance(sale, dict) else None
    msrp = pricing.get("msrp") if isinstance(pricing, dict) else None
    standard_price = pricing.get("standardPrice") if isinstance(pricing, dict) else None
    media_assets = payload.get("mediaAssets")
    media_links: list[str] = []
    if isinstance(media_assets, list):
        for item in media_assets:
            if not isinstance(item, dict):
                continue
            location = _as_text(item.get("location"))
            if not location:
                continue
            # Some user inputs may accidentally concatenate text with URLs.
            # Keep only valid http/https links to avoid broken thumbnails.
            for token in location.split():
                candidate = token.strip().strip(",;")
                parsed = urlparse(candidate)
                if parsed.scheme in {"http", "https"} and parsed.netloc:
                    media_links.append(candidate)
                    break
    if not media_links:
        media_links = None  # type: ignore[assignment]

    return {
        "product_reference": _as_text(payload.get("productReference")),
        "sku": _as_text(payload.get("sku")),
        "ean": _as_text(payload.get("ean")),
        "moin": _as_text(payload.get("moin")),
        "product_category": _as_text(
            product_description.get("category")
            if isinstance(product_description, dict)
            else None
        ),
        "price": _as_float(
            standard_price.get("amount") if isinstance(standard_price, dict) else None
        ),
        "recommended_retail_price": _as_float(
            msrp.get("amount") if isinstance(msrp, dict) else None
        ),
        "sale_price": _as_float(
            sale_price.get("amount") if isinstance(sale_price, dict) else None
        ),
        "sale_start": _as_datetime(
            sale.get("startDate") if isinstance(sale, dict) else None
        ),
        "sale_end": _as_datetime(
            sale.get("endDate") if isinstance(sale, dict) else None
        ),
        "marketplace_status": "Created/Updated via OTTO API",
        "error_message": None,
        "otto_url": _as_text(
            product_description.get("productUrl")
            if isinstance(product_description, dict)
            else None
        ),
        "media_asset_links": media_links,
        "last_changed_at": datetime.utcnow(),
    }


async def upsert_local_products_from_payloads(payloads: list[dict[str, Any]]) -> int:
    """Upsert created OTTO payloads into local products table by sku/ean/reference."""
    rows = [_payload_to_local_row(payload) for payload in payloads]
    rows = [
        row
        for row in rows
        if row.get("sku") or row.get("ean") or row.get("product_reference")
    ]
    if not rows:
        return 0

    async with SessionLocal() as db:
        upserted = 0
        for row in rows:
            sku = _as_text(row.get("sku"))
            ean = _as_text(row.get("ean"))
            product_reference = _as_text(row.get("product_reference"))

            conditions = []
            if sku:
                conditions.append(Product.sku == sku)
            if ean:
                conditions.append(Product.ean == ean)
            if product_reference:
                conditions.append(Product.product_reference == product_reference)

            existing: Product | None = None
            if conditions:
                existing = (
                    (await db.execute(select(Product).where(or_(*conditions)).limit(1)))
                    .scalars()
                    .first()
                )

            if existing is None:
                db.add(Product(**row))
            else:
                for key, value in row.items():
                    setattr(existing, key, value)

            upserted += 1

        await db.commit()
        return upserted
