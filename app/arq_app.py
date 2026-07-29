"""ARQ queue configuration and enqueue helper."""

from __future__ import annotations

from urllib.parse import urlparse

from arq import create_pool
from arq.connections import RedisSettings

from app.core.configs import settings


def redis_settings_from_url(url: str) -> RedisSettings:
    parsed = urlparse(url)
    if parsed.scheme not in {"redis", "rediss"}:
        raise ValueError(f"Unsupported Redis URL scheme: {parsed.scheme}")

    return RedisSettings(
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or 6379,
        database=int((parsed.path or "/0").lstrip("/") or "0"),
        username=parsed.username,
        password=parsed.password,
        ssl=parsed.scheme == "rediss",
    )


redis_settings = redis_settings_from_url(settings.arq_redis_url or settings.redis_url)


async def enqueue_job(function: str, **kwargs):
    redis = await create_pool(
        redis_settings,
        default_queue_name=settings.arq_queue_name,
    )
    try:
        return await redis.enqueue_job(
            function,
            _queue_name=settings.arq_queue_name,
            _expires=settings.arq_job_expires_seconds,
            **kwargs,
        )
    finally:
        await redis.aclose()


async def enqueue_jobs(jobs: list[tuple[str, dict]]):
    redis = await create_pool(
        redis_settings,
        default_queue_name=settings.arq_queue_name,
    )
    try:
        queued = []
        for function, kwargs in jobs:
            queued.append(
                await redis.enqueue_job(
                    function,
                    _queue_name=settings.arq_queue_name,
                    _expires=settings.arq_job_expires_seconds,
                    **kwargs,
                )
            )
        return queued
    finally:
        await redis.aclose()
