"""ARQ task definitions."""

from __future__ import annotations

from typing import Any

from app.arq_app import redis_settings
from app.core.configs import settings
from app.dependencies import get_afterbuy_login, get_product_service
from app.schemas.product_tasks import ProductFactoryCreateRequestDTO
from app.services.afterbuy_sync_service import run_afterbuy_import_task


async def sync_afterbuy_jv_lister_task(
    ctx: dict[str, Any],
    *,
    task_id: str,
    account: str,
    dataset: str,
    limit: int,
) -> None:
    """Execute the persisted Afterbuy JV lister import task."""
    del ctx
    await run_afterbuy_import_task(
        task_id=task_id,
        account=account,
        dataset=dataset,
        limit=limit,
    )


async def prepare_factory_products_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Prepare the category-review snapshot for a factory import."""
    del ctx
    from app.api.routes.products import _run_factory_prepare_task

    await _run_factory_prepare_task(
        process_id=process_id,
        payload=ProductFactoryCreateRequestDTO.model_validate(payload),
        afterbuy=get_afterbuy_login(),
        product_service=get_product_service(),
    )


async def enrich_factory_products_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Generate AI descriptions, bullet points, and attributes for approved rows."""
    del ctx
    from app.api.routes.products import _run_factory_enrichment_task

    await _run_factory_enrichment_task(
        process_id=process_id,
        payload=payload,
        product_service=get_product_service(),
    )


async def submit_factory_products_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Submit final prepared products to OTTO in durable ARQ worker context."""
    del ctx
    from app.api.routes.products import _run_factory_submit_task

    await _run_factory_submit_task(
        process_id=process_id,
        payload=payload,
        product_service=get_product_service(),
    )


async def regenerate_product_variant_image_task(
    ctx: dict[str, Any],
    *,
    variant_id: int,
) -> None:
    """Regenerate one product variant image without blocking API requests."""
    del ctx
    from app.database import SessionLocal
    from app.services.variant_image_service import regenerate_variant_image

    async with SessionLocal() as session:
        await regenerate_variant_image(session, variant_id=variant_id)


class WorkerSettings:
    functions = [
        sync_afterbuy_jv_lister_task,
        prepare_factory_products_task,
        enrich_factory_products_task,
        submit_factory_products_task,
        regenerate_product_variant_image_task,
    ]
    redis_settings = redis_settings
    queue_name = settings.arq_queue_name
    max_jobs = settings.arq_worker_concurrency
    job_timeout = settings.arq_job_timeout_seconds
    keep_result = 0
    max_tries = 1
