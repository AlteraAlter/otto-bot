"""Celery task definitions."""

from app.celery_app import celery_app
from app.services.afterbuy_sync_service import run_afterbuy_import_task_sync


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
