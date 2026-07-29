"""Fetch and cache Aftercool images by EAN."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Iterable

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.configs import settings
from app.models.otto_xlsx_import import OttoXlsxImportRow
from app.models.product_image_cache import ProductImageCache
import app.models.product_variants  # noqa: F401
from app.models.products import Product
from app.services.otto_xlsx_import_service import (
    clean_xlsx_text,
    valid_import_row_filters,
)


def _deduplicate_links(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    links: list[str] = []
    for value in values:
        text = clean_xlsx_text(value)
        if not text or not text.startswith(("http://", "https://")) or text in seen:
            continue
        seen.add(text)
        links.append(text)
    return links


def extract_aftercool_image_links(
    payload: Any,
) -> tuple[str | None, list[str], list[str]]:
    """Return gallery URL, picture URLs, and all image links from Aftercool payload."""
    if not isinstance(payload, dict):
        return None, [], []

    gallery_url = clean_xlsx_text(payload.get("gallery_url"))
    raw_picture_urls = payload.get("picture_urls") or payload.get("pictureUrls") or []
    picture_urls = (
        _deduplicate_links(raw_picture_urls)
        if isinstance(raw_picture_urls, list)
        else _deduplicate_links([raw_picture_urls])
    )
    media_asset_links = _deduplicate_links([gallery_url, *picture_urls])
    return gallery_url, picture_urls, media_asset_links


def image_cache_payload(
    *,
    ean: str,
    payload: dict[str, Any] | None,
    status: str,
    error_message: str | None = None,
) -> dict[str, Any]:
    payload = payload or {}
    gallery_url, picture_urls, media_asset_links = extract_aftercool_image_links(
        payload
    )
    return {
        "ean": ean,
        "product_id": clean_xlsx_text(payload.get("product_id")),
        "gallery_url": gallery_url,
        "picture_urls": picture_urls,
        "media_asset_links": media_asset_links,
        "account": clean_xlsx_text(payload.get("account")),
        "product_factory_id": clean_xlsx_text(payload.get("product_factory_id")),
        "lister_factory_id": clean_xlsx_text(payload.get("lister_factory_id")),
        "status": status,
        "error_message": error_message,
        "raw_payload": payload or None,
        "fetched_at": datetime.now(UTC),
    }


async def upsert_image_cache_rows(
    session: AsyncSession,
    rows: list[dict[str, Any]],
    *,
    batch_size: int = 1000,
) -> int:
    if not rows:
        return 0

    table = ProductImageCache.__table__
    update_columns = [column.name for column in table.columns if column.name != "ean"]
    upserted = 0
    safe_batch_size = min(batch_size, 1000)
    for start in range(0, len(rows), safe_batch_size):
        chunk = rows[start : start + safe_batch_size]
        stmt = insert(table).values(chunk)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_product_image_cache_ean",
            set_={column: getattr(stmt.excluded, column) for column in update_columns},
        )
        await session.execute(stmt)
        await session.commit()
        upserted += len(chunk)
    return upserted


async def update_products_media_from_image_cache(
    session: AsyncSession,
    *,
    only_missing: bool = False,
) -> int:
    cache = ProductImageCache.__table__
    product = Product.__table__
    stmt = (
        update(product)
        .where(product.c.ean == cache.c.ean)
        .where(func.cardinality(cache.c.media_asset_links) > 0)
        .values(media_asset_links=cache.c.media_asset_links)
    )
    if only_missing:
        stmt = stmt.where(
            (product.c.media_asset_links.is_(None))
            | (func.cardinality(product.c.media_asset_links) == 0)
        )
    result = await session.execute(stmt)
    await session.commit()
    return int(result.rowcount or 0)


async def candidate_eans_from_import(
    session: AsyncSession,
    *,
    account: str | None = None,
    only_missing: bool = True,
    retry_failed: bool = False,
    limit: int | None = None,
) -> list[str]:
    stmt = (
        select(OttoXlsxImportRow.ean)
        .where(
            OttoXlsxImportRow.ean.is_not(None),
            *valid_import_row_filters(),
        )
        .distinct()
        .order_by(OttoXlsxImportRow.ean.asc())
    )
    if account:
        stmt = stmt.where(OttoXlsxImportRow.account == account.lower())
    if only_missing:
        cached_stmt = select(ProductImageCache.ean).where(
            ProductImageCache.ean == OttoXlsxImportRow.ean
        )
        if retry_failed:
            cached_stmt = cached_stmt.where(ProductImageCache.status != "failed")
        cached_exists = cached_stmt.exists()
        stmt = stmt.where(~cached_exists)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [ean for ean in rows if clean_xlsx_text(ean)]


@dataclass
class AftercoolImageSyncResult:
    requested_eans: int
    fetched: int
    with_images: int
    failed: int
    products_updated: int


async def sync_aftercool_images_by_ean(
    *,
    session: AsyncSession,
    account: str | None = None,
    eans: list[str] | None = None,
    limit: int | None = None,
    only_missing: bool = True,
    concurrency: int = 10,
    batch_size: int = 200,
    update_products: bool = True,
    timeout_seconds: float | None = None,
    retry_failed: bool = False,
) -> AftercoolImageSyncResult:
    """Fetch `/api/images-by-ean?ean=...` responses and cache image URLs."""
    requested_eans = eans or await candidate_eans_from_import(
        session,
        account=account,
        only_missing=only_missing,
        retry_failed=retry_failed,
        limit=limit,
    )
    if not requested_eans:
        products_updated = (
            await update_products_media_from_image_cache(session, only_missing=True)
            if update_products
            else 0
        )
        return AftercoolImageSyncResult(0, 0, 0, 0, products_updated)

    safe_concurrency = max(1, min(concurrency, 30))
    semaphore = asyncio.Semaphore(safe_concurrency)
    base_url = settings.afterbuy_base_url.rstrip("/")

    async with httpx.AsyncClient(
        timeout=timeout_seconds or settings.afterbuy_timeout_seconds,
        follow_redirects=True,
    ) as client:
        login = await client.post(
            f"{base_url}/auth/login",
            json={
                "username": settings.afterbuy_username,
                "password": settings.afterbuy_password,
            },
        )
        login.raise_for_status()
        session_cookie = login.cookies.get("session")
        if not session_cookie:
            raise RuntimeError("Aftercool login did not return a session cookie.")

        async def fetch_one(ean: str) -> dict[str, Any]:
            async with semaphore:
                try:
                    response = await client.get(
                        f"{base_url}/api/images-by-ean",
                        params={"ean": ean},
                        cookies={"session": session_cookie},
                    )
                    response.raise_for_status()
                    payload = response.json()
                    if not isinstance(payload, dict):
                        payload = {"items": payload}
                    _, _, media_asset_links = extract_aftercool_image_links(payload)
                    return image_cache_payload(
                        ean=ean,
                        payload=payload,
                        status="fetched" if media_asset_links else "no_images",
                    )
                except Exception as exc:
                    message = str(exc).strip()
                    return image_cache_payload(
                        ean=ean,
                        payload=None,
                        status="failed",
                        error_message=(
                            f"{exc.__class__.__name__}: {message}"[:1000]
                            if message
                            else exc.__class__.__name__
                        ),
                    )

        fetched = 0
        with_images = 0
        failed = 0
        for start in range(0, len(requested_eans), batch_size):
            chunk = requested_eans[start : start + batch_size]
            rows = await asyncio.gather(*[fetch_one(ean) for ean in chunk])
            fetched += len(rows)
            with_images += sum(1 for row in rows if row.get("media_asset_links"))
            failed += sum(1 for row in rows if row.get("status") == "failed")
            await upsert_image_cache_rows(
                session,
                rows,
                batch_size=batch_size,
            )

    products_updated = (
        await update_products_media_from_image_cache(session, only_missing=True)
        if update_products
        else 0
    )
    return AftercoolImageSyncResult(
        requested_eans=len(requested_eans),
        fetched=fetched,
        with_images=with_images,
        failed=failed,
        products_updated=products_updated,
    )
