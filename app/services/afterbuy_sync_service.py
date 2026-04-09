"""Afterbuy-to-database synchronization helpers shared by API and Celery."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.afterbuy_auth import AfterbuyAuth
from app.dependencies import get_afterbuy_login
from app.database import SessionLocal
from app.models.jv_lister import JVLister
from app.models.product_import_tasks import ProductImportTask

POSTGRES_MAX_BIND_PARAMS = 32767
JV_LISTER_UPSERT_COLUMN_COUNT = 4
DEFAULT_JV_LISTER_BATCH_SIZE = 1000
MAX_TASK_ERROR_LENGTH = 280


def summarize_task_error(exc: Exception) -> str:
    """Store a short task error message instead of huge SQL traces."""
    message = str(exc).strip() or exc.__class__.__name__
    lowered = message.lower()

    if any(
        token in lowered
        for token in (
            "sqlalchemy",
            "asyncpg",
            "psycopg",
            "postgres",
            "database",
            "duplicate key",
            "violates",
            "constraint",
            "select ",
            "insert ",
            "update ",
            "delete ",
            " from ",
            " where ",
        )
    ):
        return "Database operation failed while processing this job. Please retry in a few minutes."
    if any(
        token in lowered
        for token in ("timeout", "timed out", "read timeout", "connect timeout")
    ):
        return "The operation timed out while fetching data. Please retry in a few minutes."
    if any(
        token in lowered
        for token in ("connection refused", "could not connect", "network", "temporarily unavailable")
    ):
        return "A temporary connection problem occurred. Please retry in a few minutes."

    first_line = message.splitlines()[0].strip()
    compact = " ".join(first_line.split())
    if len(compact) <= MAX_TASK_ERROR_LENGTH:
        return compact
    return f"{compact[: MAX_TASK_ERROR_LENGTH - 1].rstrip()}…"


def extract_afterbuy_items(payload: Any) -> list[dict[str, Any]]:
    """Extract list-like collections from the Afterbuy products response."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("items", "data", "products", "results", "rows", "content"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    nested = payload.get("data")
    if isinstance(nested, dict):
        for key in ("items", "products", "results", "rows"):
            value = nested.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

    return []


def extract_afterbuy_has_more(payload: Any) -> bool:
    """Read the upstream continuation flag if present."""
    if isinstance(payload, dict):
        return bool(payload.get("has_more"))
    return False


def _empty_to_none(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return value


def _as_text(value: Any) -> str | None:
    value = _empty_to_none(value)
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def extract_afterbuy_product_id(item: dict[str, Any]) -> str | None:
    """Read the upstream product id from common top-level or nested fields."""
    for source in (item, item.get("data")):
        if not isinstance(source, dict):
            continue
        for key in ("product_id", "productId", "ID", "id", "EbayProductId"):
            value = _as_text(source.get(key))
            if value:
                return value
    return None


async def upsert_jv_lister_batch(
    db: AsyncSession,
    rows: list[dict[str, Any]],
) -> int:
    """Upsert raw Afterbuy rows into `jv_lister` using account + remote id."""
    if not rows:
        return 0

    max_rows_per_statement = max(
        1,
        min(
            DEFAULT_JV_LISTER_BATCH_SIZE,
            POSTGRES_MAX_BIND_PARAMS // JV_LISTER_UPSERT_COLUMN_COUNT,
        ),
    )

    saved_rows = 0
    for start in range(0, len(rows), max_rows_per_statement):
        chunk = rows[start : start + max_rows_per_statement]
        insert_stmt = insert(JVLister).values(chunk)
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["account", "remote_product_id"],
            set_={
                "dataset": insert_stmt.excluded.dataset,
                "payload": insert_stmt.excluded.payload,
                "fetched_at": func.now(),
            },
        )
        await db.execute(upsert_stmt)
        saved_rows += len(chunk)

    await db.commit()
    return saved_rows


async def sync_afterbuy_to_jv_lister(
    *,
    db: AsyncSession,
    afterbuy: AfterbuyAuth,
    account: str,
    dataset: str,
    limit: int,
    start_page: int = 0,
    progress_callback: Any | None = None,
) -> dict[str, int | str | bool]:
    """Fetch Afterbuy pages until empty and persist rows into `jv_lister`."""
    offset = start_page
    pages_processed = 0
    fetched_rows = 0
    saved_rows = 0
    skipped_rows = 0

    while True:
        payload = await afterbuy.fetch_products_page(
            account=account,
            dataset=dataset,
            offset=offset,
            limit=limit,
        )
        items = extract_afterbuy_items(payload)
        if not items:
            break

        rows_to_save: list[dict[str, Any]] = []
        for item in items:
            remote_product_id = extract_afterbuy_product_id(item)
            if not remote_product_id:
                skipped_rows += 1
                continue
            rows_to_save.append(
                {
                    "account": account,
                    "remote_product_id": remote_product_id,
                    "dataset": dataset,
                    "payload": item,
                }
            )

        if rows_to_save:
            saved_rows += await upsert_jv_lister_batch(db, rows_to_save)

        fetched_rows += len(items)
        pages_processed += 1
        offset += len(items)

        if progress_callback is not None:
            await progress_callback(
                {
                    "fetched_rows": fetched_rows,
                    "saved_rows": saved_rows,
                    "skipped_rows": skipped_rows,
                }
            )

        if not extract_afterbuy_has_more(payload):
            break

    return {
        "success": True,
        "account": account,
        "dataset": dataset,
        "pagesProcessed": pages_processed,
        "fetchedRows": fetched_rows,
        "savedRows": saved_rows,
        "skippedRows": skipped_rows,
        "stoppedAtOffset": offset,
    }


async def run_afterbuy_import_task(
    *,
    task_id: str,
    account: str,
    dataset: str,
    limit: int,
) -> None:
    """Execute one persisted Afterbuy import task and update task progress."""
    async with SessionLocal() as session:
        task = await session.get(ProductImportTask, task_id)
        if task is None:
            return

        task.status = "running"
        task.started_at = datetime.utcnow()
        task.error_message = None
        await session.commit()

        try:
            afterbuy = get_afterbuy_login()

            async def update_progress(progress: dict[str, int]) -> None:
                task.total_rows = progress["fetched_rows"]
                task.processed_rows = progress["fetched_rows"]
                task.upserted_rows = progress["saved_rows"]
                task.skipped_rows = progress["skipped_rows"]
                await session.commit()
                await asyncio.sleep(0)

            result = await sync_afterbuy_to_jv_lister(
                db=session,
                afterbuy=afterbuy,
                account=account,
                dataset=dataset,
                limit=limit,
                progress_callback=update_progress,
            )

            task.status = "completed"
            task.total_rows = int(result["fetchedRows"])
            task.processed_rows = int(result["fetchedRows"])
            task.upserted_rows = int(result["savedRows"])
            task.skipped_rows = int(result["skippedRows"])
            task.finished_at = datetime.utcnow()
            task.error_message = None
            await session.commit()
        except Exception as exc:
            await session.rollback()
            task = await session.get(ProductImportTask, task_id)
            if task is None:
                return
            task.status = "failed"
            task.error_message = summarize_task_error(exc)
            task.finished_at = datetime.utcnow()
            await session.commit()


def run_afterbuy_import_task_sync(
    *,
    task_id: str,
    account: str,
    dataset: str,
    limit: int,
) -> None:
    """Synchronous wrapper used by Celery workers."""
    asyncio.run(
        run_afterbuy_import_task(
            task_id=task_id,
            account=account,
            dataset=dataset,
            limit=limit,
        )
    )
