from __future__ import annotations

from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.products import Product
from app.schemas.enums import VatEnum
from app.services.product_service import ProductService


class ProductSyncService:
    def __init__(self, product_service: ProductService, db: AsyncSession):
        self.product_service = product_service
        self.db = db

    @staticmethod
    def _extract_collection(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []

        for key in (
            "productVariations",
            "items",
            "products",
            "content",
            "data",
            "results",
        ):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    @staticmethod
    def _read_path(source: dict[str, Any], path: list[str]) -> Any:
        current: Any = source
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    @classmethod
    def _get_string(cls, source: dict[str, Any], paths: list[list[str]]) -> str | None:
        for path in paths:
            value = cls._read_path(source, path)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @classmethod
    def _get_float(cls, source: dict[str, Any], paths: list[list[str]]) -> float | None:
        for path in paths:
            value = cls._read_path(source, path)
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    continue
        return None

    @staticmethod
    def _normalize_vat(raw: str | None) -> VatEnum:
        if not raw:
            return VatEnum.FULL
        value = raw.strip().upper()
        if value in VatEnum.__members__:
            return VatEnum[value]
        if value in {member.value for member in VatEnum}:
            return VatEnum(value)
        return VatEnum.FULL

    @classmethod
    def _to_db_record(cls, item: dict[str, Any], account_source: str) -> dict[str, Any] | None:
        sku = cls._get_string(item, [["sku"], ["productSku"]])
        if not sku:
            return None

        bullet_points_raw = cls._read_path(item, ["productDescription", "bulletPoints"])
        bullet_points = (
            [bp for bp in bullet_points_raw if isinstance(bp, str) and bp.strip()]
            if isinstance(bullet_points_raw, list)
            else []
        )

        return {
            "sku": sku,
            "account_source": account_source,
            "ean": cls._get_string(item, [["ean"]]),
            "pricing": cls._get_float(item, [["pricing", "standardPrice", "amount"], ["price", "amount"], ["price"]]) or 0.0,
            "vat": cls._normalize_vat(cls._get_string(item, [["pricing", "vat"], ["vat"]])),
            "productReference": cls._get_string(item, [["productReference"], ["reference"]]),
            "brand_id": cls._get_string(item, [["productDescription", "brandId"], ["productDescription", "brand"]]),
            "category": cls._get_string(item, [["productDescription", "category"], ["category"]]),
            "productLine": cls._get_string(item, [["productDescription", "productLine"], ["name"]]),
            "description": cls._get_string(item, [["productDescription", "description"]]),
            "bullet_points": bullet_points,
        }

    async def sync_products(self, *, account_source: str, limit: int, max_pages: int) -> dict[str, Any]:
        total_fetched = 0
        total_upserted = 0
        page = 0

        while page < max_pages:
            payload = {"page": page, "limit": limit}
            response = await self.product_service.get_products(payload)
            items = self._extract_collection(response)
            if not items:
                break

            total_fetched += len(items)
            records = []
            for item in items:
                record = self._to_db_record(item, account_source)
                if record:
                    records.append(record)

            if records:
                stmt = insert(Product).values(records)
                update_cols = {
                    column.name: getattr(stmt.excluded, column.name)
                    for column in Product.__table__.columns
                    if column.name not in {"id"}
                }
                stmt = stmt.on_conflict_do_update(
                    index_elements=["sku", "account_source"],
                    set_=update_cols,
                )
                await self.db.execute(stmt)
                await self.db.commit()
                total_upserted += len(records)

            if len(items) < limit:
                break
            page += 1

        return {
            "success": True,
            "accountSource": account_source,
            "fetched": total_fetched,
            "upserted": total_upserted,
            "pagesProcessed": page + 1 if total_fetched > 0 else 0,
        }
