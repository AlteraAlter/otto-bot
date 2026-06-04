"""Celery task definitions."""

import asyncio
import os
from collections.abc import Awaitable
from typing import Any

from app.celery_app import celery_app
from app.dependencies import get_afterbuy_login, get_product_service
from app.schemas.product_tasks import ProductFactoryCreateRequestDTO
from app.services.afterbuy_sync_service import run_afterbuy_import_task_sync

_TASK_LOOP: asyncio.AbstractEventLoop | None = None
_TASK_LOOP_PID: int | None = None


def _run_async(awaitable: Awaitable[Any]) -> Any:
    """Run async route helpers on one event loop per Celery worker process."""
    global _TASK_LOOP, _TASK_LOOP_PID
    current_pid = os.getpid()
    if _TASK_LOOP is None or _TASK_LOOP.is_closed() or _TASK_LOOP_PID != current_pid:
        _TASK_LOOP = asyncio.new_event_loop()
        _TASK_LOOP_PID = current_pid
        asyncio.set_event_loop(_TASK_LOOP)
    return _TASK_LOOP.run_until_complete(awaitable)


@celery_app.task(name="afterbuy.sync_jv_lister")
def sync_afterbuy_jv_lister_task(
    *,
    task_id: str,
    account: str,
    dataset: str,
    limit: int,
) -> None:
    """Execute the persisted Afterbuy JV lister import task."""
    run_afterbuy_import_task_sync(
        task_id=task_id,
        account=account,
        dataset=dataset,
        limit=limit,
    )


@celery_app.task(name="factory.prepare")
def prepare_factory_products_task(
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Prepare the category-review snapshot for a factory import."""
    from app.api.routes.products import _run_factory_prepare_task

    _run_async(
        _run_factory_prepare_task(
            process_id=process_id,
            payload=ProductFactoryCreateRequestDTO.model_validate(payload),
            afterbuy=get_afterbuy_login(),
            product_service=get_product_service(),
        )
    )


@celery_app.task(name="factory.enrich")
def enrich_factory_products_task(
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Generate AI descriptions, bullet points, and attributes for approved rows."""
    from app.api.routes.products import _run_factory_enrichment_task

    _run_async(
        _run_factory_enrichment_task(
            process_id=process_id,
            payload=payload,
            product_service=get_product_service(),
        )
    )


@celery_app.task(name="factory.submit")
def submit_factory_products_task(
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Submit final prepared products to OTTO in durable Celery worker context."""
    from app.api.routes.products import _run_factory_submit_task

    _run_async(
        _run_factory_submit_task(
            process_id=process_id,
            payload=payload,
            product_service=get_product_service(),
        )
    )
