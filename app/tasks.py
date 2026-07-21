"""ARQ task definitions."""

from __future__ import annotations

from typing import Any

from app.arq_app import redis_settings
from app.core.configs import settings
from app.core.logger import logging
from app.core.sentry import init_sentry
from app.dependencies import get_afterbuy_login, get_product_service
from app.schemas.product_tasks import ProductFactoryCreateRequestDTO
from app.services.attribute_fill_service import (
    run_attribute_fill_chunk_task,
    run_attribute_fill_task,
)
from app.services.afterbuy_sync_service import run_afterbuy_import_task

logger = logging.getLogger("product_mapper_flow")

init_sentry()


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

    logger.info(
        "PIPELINE event=arq_prepare_task_received process_id=%s payload_keys=%s",
        process_id,
        sorted(payload.keys()),
    )
    try:
        await _run_factory_prepare_task(
            process_id=process_id,
            payload=ProductFactoryCreateRequestDTO.model_validate(payload),
            afterbuy=get_afterbuy_login(),
            product_service=get_product_service(),
        )
        logger.info("PIPELINE event=arq_prepare_task_finished process_id=%s", process_id)
    except Exception:
        logger.exception("PIPELINE event=arq_prepare_task_crashed process_id=%s", process_id)
        raise


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


async def enrich_factory_products_chunk_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    chunk_id: int,
    start_index: int,
    end_index: int,
    ai_key_slot: int | None = None,
    controller: str,
) -> None:
    """Generate AI enrichment for one prepared-products chunk."""
    del ctx
    from app.api.routes.products import _run_factory_enrichment_chunk_task

    await _run_factory_enrichment_chunk_task(
        process_id=process_id,
        chunk_id=chunk_id,
        start_index=start_index,
        end_index=end_index,
        ai_key_slot=ai_key_slot,
        controller=controller,
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
        afterbuy=get_afterbuy_login(),
    )


async def submit_factory_availability_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    availability_items: list[dict[str, Any]],
) -> None:
    """Send stock and delivery profile after OTTO product creation succeeds."""
    del ctx
    from app.api.routes.products import _run_factory_availability_task

    await _run_factory_availability_task(
        process_id=process_id,
        availability_items=availability_items,
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


async def fill_active_product_attributes_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    payload: dict[str, Any],
) -> None:
    """Fill only missing AI attributes for active marketplace products."""
    del ctx
    from app.dependencies import get_product_service

    await run_attribute_fill_task(
        process_id=process_id,
        product_service=get_product_service(),
        controller=str(payload.get("controller") or "xl"),
        created_by_user_id=payload.get("created_by_user_id"),
    )


async def fill_active_product_attributes_chunk_task(
    ctx: dict[str, Any],
    *,
    process_id: str,
    chunk_id: int,
    ai_key_slot: int | None = None,
    controller: str,
    created_by_user_id: int | None = None,
) -> None:
    """Fill missing AI attributes for one persisted active-product chunk."""
    del ctx
    await run_attribute_fill_chunk_task(
        process_id=process_id,
        chunk_id=chunk_id,
        ai_key_slot=ai_key_slot,
        product_service=get_product_service(),
        controller=controller,
        created_by_user_id=created_by_user_id,
    )


class WorkerSettings:
    functions = [
        sync_afterbuy_jv_lister_task,
        prepare_factory_products_task,
        enrich_factory_products_task,
        enrich_factory_products_chunk_task,
        submit_factory_products_task,
        submit_factory_availability_task,
        regenerate_product_variant_image_task,
        fill_active_product_attributes_task,
        fill_active_product_attributes_chunk_task,
    ]
    redis_settings = redis_settings
    queue_name = settings.arq_queue_name
    max_jobs = settings.arq_worker_concurrency
    job_timeout = settings.arq_job_timeout_seconds
    keep_result = 0
    max_tries = 1
