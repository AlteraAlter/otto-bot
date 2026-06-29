import json
import logging
from datetime import UTC, datetime
from typing import Any

from redis import asyncio as redis_asyncio
try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:  # pragma: no cover - optional dependency fallback
    AsyncIOMotorClient = None

from app.core.configs import settings
from app.database import SessionLocal
from app.models.factory_task_states import FactoryTaskState


class FactoryTaskStateService:
    def __init__(self) -> None:
        self._redis = None
        self._mongo_client = None
        self._mongo_collection = None
        self._logger = logging.getLogger("factory_task_state")

    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        try:
            self._redis = redis_asyncio.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        except Exception:
            self._redis = None
        return self._redis

    async def _get_mongo_collection(self):
        if not settings.mongodb_url or AsyncIOMotorClient is None:
            return None
        if self._mongo_collection is not None:
            return self._mongo_collection
        try:
            self._mongo_client = AsyncIOMotorClient(settings.mongodb_url)
            database = self._mongo_client[settings.mongodb_database]
            self._mongo_collection = database[
                settings.mongodb_factory_tasks_collection
            ]
            await self._mongo_collection.create_index("process_id", unique=True)
            await self._mongo_collection.create_index("created_by_user_id")
            await self._mongo_collection.create_index("controller")
            await self._mongo_collection.create_index("factory_id")
            await self._mongo_collection.create_index("status")
            await self._mongo_collection.create_index("current_step")
        except Exception:
            self._logger.debug("mongo_init_failed")
            self._mongo_collection = None
        return self._mongo_collection

    @staticmethod
    def _cache_key(process_id: str) -> str:
        return f"factory-task-state:{process_id}"

    @staticmethod
    def _normalize_task(process_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        task = dict(payload)
        task["process_id"] = process_id
        return task

    @staticmethod
    def _with_owner(
        process_id: str,
        payload: dict[str, Any],
        created_by_user_id: int | None,
    ) -> dict[str, Any]:
        task = FactoryTaskStateService._normalize_task(process_id, payload)
        if created_by_user_id is not None:
            task["created_by_user_id"] = created_by_user_id
        return task

    async def get_task(self, process_id: str) -> dict[str, Any] | None:
        mongo_collection = await self._get_mongo_collection()
        if mongo_collection is not None:
            try:
                document = await mongo_collection.find_one({"process_id": process_id})
                if isinstance(document, dict):
                    payload = document.get("task_payload")
                    if isinstance(payload, dict):
                        return self._with_owner(
                            process_id,
                            payload,
                            document.get("created_by_user_id"),
                        )
            except Exception:
                self._logger.debug("mongo_get_failed process_id=%s", process_id)

        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                cached = await redis_client.get(self._cache_key(process_id))
                if cached:
                    payload = json.loads(cached)
                    if isinstance(payload, dict):
                        return self._normalize_task(process_id, payload)
            except Exception:
                self._logger.debug("redis_get_failed process_id=%s", process_id)

        async with SessionLocal() as session:
            record = await session.get(FactoryTaskState, process_id)
            if record is None:
                return None
            task = self._with_owner(
                process_id,
                dict(record.task_payload or {}),
                record.created_by_user_id,
            )

        await self.cache_task(process_id, task)
        return task

    async def save_task(
        self,
        process_id: str,
        task: dict[str, Any],
        *,
        created_by_user_id: int | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        owner_id = created_by_user_id
        if owner_id is None:
            raw_owner = task.get("created_by_user_id")
            if raw_owner is not None:
                try:
                    owner_id = int(raw_owner)
                except (TypeError, ValueError):
                    owner_id = None

        async with SessionLocal() as session:
            record = await session.get(FactoryTaskState, process_id)
            if owner_id is None and record is not None:
                owner_id = record.created_by_user_id

        normalized = self._with_owner(process_id, task, owner_id)
        status = str(normalized.get("status") or "IN_PROGRESS")
        current_step = normalized.get("current_step")
        controller = normalized.get("controller")
        factory_id = normalized.get("factory_id")
        error_message = None
        issues = normalized.get("issues")
        if isinstance(issues, list) and issues:
            error_message = str(issues[0])[:1000]

        async with SessionLocal() as session:
            record = await session.get(FactoryTaskState, process_id)
            if record is None:
                record = FactoryTaskState(
                    process_id=process_id,
                    created_by_user_id=owner_id,
                    controller=str(controller) if controller else None,
                    factory_id=str(factory_id) if factory_id is not None else None,
                    status=status,
                    current_step=str(current_step) if current_step else None,
                    task_payload=normalized,
                    error_message=error_message,
                    finished_at=now if status in {"DONE", "FAILED"} else None,
                )
                session.add(record)
            else:
                if owner_id is not None and record.created_by_user_id is None:
                    record.created_by_user_id = owner_id
                if controller:
                    record.controller = str(controller)
                if factory_id is not None:
                    record.factory_id = str(factory_id)
                record.status = status
                record.current_step = str(current_step) if current_step else None
                record.task_payload = normalized
                record.error_message = error_message
                record.finished_at = now if status in {"DONE", "FAILED"} else None
            await session.commit()

        mongo_collection = await self._get_mongo_collection()
        if mongo_collection is not None:
            try:
                await mongo_collection.update_one(
                    {"process_id": process_id},
                    {
                        "$set": {
                            "process_id": process_id,
                            "created_by_user_id": owner_id,
                            "controller": str(controller) if controller else None,
                            "factory_id": (
                                str(factory_id) if factory_id is not None else None
                            ),
                            "status": status,
                            "current_step": str(current_step)
                            if current_step
                            else None,
                            "task_payload": normalized,
                            "error_message": error_message,
                            "updated_at": now,
                            "finished_at": now
                            if status in {"DONE", "FAILED"}
                            else None,
                        },
                        "$setOnInsert": {"created_at": now},
                    },
                    upsert=True,
                )
            except Exception:
                self._logger.debug("mongo_save_failed process_id=%s", process_id)

        await self.cache_task(process_id, normalized)
        return normalized

    async def delete_task(self, process_id: str) -> None:
        mongo_collection = await self._get_mongo_collection()
        if mongo_collection is not None:
            try:
                await mongo_collection.delete_one({"process_id": process_id})
            except Exception:
                self._logger.debug("mongo_delete_failed process_id=%s", process_id)

        redis_client = await self._get_redis()
        if redis_client is not None:
            try:
                await redis_client.delete(self._cache_key(process_id))
            except Exception:
                self._logger.debug("redis_delete_failed process_id=%s", process_id)

        async with SessionLocal() as session:
            record = await session.get(FactoryTaskState, process_id)
            if record is not None:
                await session.delete(record)
                await session.commit()

    async def cache_task(
        self,
        process_id: str,
        task: dict[str, Any],
        *,
        ttl_seconds: int = 60 * 60 * 24,
    ) -> None:
        redis_client = await self._get_redis()
        if redis_client is None:
            return
        try:
            payload = dict(task)
            payload.pop("process_id", None)
            await redis_client.set(
                self._cache_key(process_id),
                json.dumps(payload, ensure_ascii=False),
                ex=ttl_seconds,
            )
        except Exception:
            self._logger.debug("redis_set_failed process_id=%s", process_id)
