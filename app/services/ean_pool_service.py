"""Service helpers for free EAN pool management."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ean_pool import EanPoolItem

EAN_POOL_STATUSES = {"available", "reserved", "used", "disabled"}


def normalize_ean(value: object) -> str:
    return "".join(ch for ch in str(value or "").strip() if ch.isdigit())


def ean_pool_item_to_dict(item: EanPoolItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "ean": item.ean,
        "status": item.status,
        "source": item.source,
        "reservedFor": item.reserved_for,
        "usedFor": item.used_for,
        "metadata": item.metadata_json or {},
        "note": item.note,
        "createdByUserId": item.created_by_user_id,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
        "reservedAt": item.reserved_at.isoformat() if item.reserved_at else None,
        "usedAt": item.used_at.isoformat() if item.used_at else None,
    }


class EanPoolService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def import_eans(
        self,
        values: list[object],
        *,
        source: str | None = None,
        note: str | None = None,
        created_by_user_id: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized = list(dict.fromkeys(normalize_ean(value) for value in values))
        eans = [value for value in normalized if value]
        if not eans:
            return {"inserted": 0, "skipped": len(values), "items": []}

        stmt = (
            insert(EanPoolItem)
            .values(
                [
                    {
                        "ean": ean,
                        "status": "available",
                        "source": source,
                        "note": note,
                        "created_by_user_id": created_by_user_id,
                        "metadata_json": metadata or None,
                    }
                    for ean in eans
                ]
            )
            .on_conflict_do_nothing(index_elements=["ean"])
            .returning(EanPoolItem)
        )
        inserted = list((await self.session.scalars(stmt)).all())
        await self.session.commit()
        return {
            "inserted": len(inserted),
            "skipped": len(values) - len(inserted),
            "items": [ean_pool_item_to_dict(item) for item in inserted],
        }

    async def stats(self) -> dict[str, int]:
        stmt = select(EanPoolItem.status, func.count(EanPoolItem.id)).group_by(
            EanPoolItem.status
        )
        rows = (await self.session.execute(stmt)).all()
        result = {status: 0 for status in EAN_POOL_STATUSES}
        for status, count in rows:
            result[str(status)] = int(count)
        return result

    async def list_items(
        self,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(EanPoolItem)
            .order_by(EanPoolItem.id.asc())
            .limit(max(1, min(limit, 1000)))
        )
        if status:
            stmt = stmt.where(EanPoolItem.status == status)
        items = list((await self.session.scalars(stmt)).all())
        return [ean_pool_item_to_dict(item) for item in items]

    async def reserve_next(
        self,
        *,
        reserved_for: str,
        metadata: dict[str, Any] | None = None,
    ) -> EanPoolItem:
        now = datetime.now(UTC)
        stmt = (
            select(EanPoolItem)
            .where(EanPoolItem.status == "available")
            .order_by(EanPoolItem.id.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        item = await self.session.scalar(stmt)
        if item is None:
            raise ValueError("No available EAN in pool.")
        item.status = "reserved"
        item.reserved_for = reserved_for
        item.reserved_at = now
        item.metadata_json = {**(item.metadata_json or {}), **(metadata or {})} or None
        item.updated_at = now
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def mark_used(self, ean: str, *, used_for: str) -> EanPoolItem:
        item = await self._get_by_ean(ean)
        now = datetime.now(UTC)
        item.status = "used"
        item.used_for = used_for
        item.used_at = now
        item.updated_at = now
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def release(self, ean: str) -> EanPoolItem:
        item = await self._get_by_ean(ean)
        if item.status != "reserved":
            raise ValueError("Only reserved EAN can be released.")
        item.status = "available"
        item.reserved_for = None
        item.reserved_at = None
        item.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def _get_by_ean(self, ean: str) -> EanPoolItem:
        normalized = normalize_ean(ean)
        item = await self.session.scalar(
            select(EanPoolItem).where(EanPoolItem.ean == normalized).limit(1),
        )
        if item is None:
            raise ValueError("EAN not found in pool.")
        return item
