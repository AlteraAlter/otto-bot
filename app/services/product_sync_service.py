"""Synchronize OTTO products into local relational tables.

The sync process fetches pages from OTTO, maps each item into local DB columns,
upserts product rows, and replaces associated attribute rows so the local store
can back UI-heavy querying.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, insert as sa_insert
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_attributes import ProductAttributes
from app.models.products import Product
from app.schemas.enums import VatEnum
from app.services.product_service import ProductService


class ProductSyncService:
    """Service that performs paginated upstream-to-local product synchronization."""

    def __init__(self, product_service: ProductService, db: AsyncSession):
        """Wire OTTO product service and async SQLAlchemy session."""
        self.product_service = product_service
        self.db = db

    @staticmethod
    def _extract_collection(payload: Any) -> list[dict[str, Any]]:
        """Extract list-like product collections from various upstream envelopes."""
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
        """Safely read nested dictionary value using path segments."""
        current: Any = source
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    @classmethod
    def _get_string(cls, source: dict[str, Any], paths: list[list[str]]) -> str | None:
        """Return first non-empty string found among alternative nested paths."""
        for path in paths:
            value = cls._read_path(source, path)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @classmethod
    def _get_float(cls, source: dict[str, Any], paths: list[list[str]]) -> float | None:
        """Return first numeric value from candidate paths, coercing strings."""
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
        """Map raw VAT strings to known enum values with safe default fallback."""
        if not raw:
            return VatEnum.FULL
        value = raw.strip().upper()
        if value in VatEnum.__members__:
            return VatEnum[value]
        if value in {member.value for member in VatEnum}:
            return VatEnum(value)
        return VatEnum.FULL

    @classmethod
    def _to_db_record(
        cls, item: dict[str, Any], account_source: str
    ) -> dict[str, Any] | None:
        """Map one upstream product payload to `products` table-compatible record."""
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
            "pricing": cls._get_float(
                item,
                [
                    ["pricing", "standardPrice", "amount"],
                    ["price", "amount"],
                    ["price"],
                ],
            )
            or 0.0,
            "vat": cls._normalize_vat(
                cls._get_string(item, [["pricing", "vat"], ["vat"]])
            ),
            "productReference": cls._get_string(
                item, [["productReference"], ["reference"]]
            ),
            "brand_id": cls._get_string(
                item,
                [["productDescription", "brandId"], ["productDescription", "brand"]],
            ),
            "category": cls._get_string(
                item, [["productDescription", "category"], ["category"]]
            ),
            "productLine": cls._get_string(
                item, [["productDescription", "productLine"], ["name"]]
            ),
            "description": cls._get_string(
                item, [["productDescription", "description"]]
            ),
            "bullet_points": bullet_points,
        }

    @classmethod
    def _to_description_records(cls, item: dict[str, Any]) -> list[dict[str, str]]:
        """Flatten product attribute lists into `product_descriptions` row payloads."""
        sku = cls._get_string(item, [["sku"], ["productSku"]])
        if not sku:
            return []

        attributes = cls._read_path(item, ["productDescription", "attributes"])
        if not isinstance(attributes, list):
            return []

        rows: list[dict[str, str]] = []
        for attribute in attributes:
            if not isinstance(attribute, dict):
                continue
            name = attribute.get("name")
            values = attribute.get("values")
            if not isinstance(name, str) or not name.strip():
                continue
            if not isinstance(values, list):
                continue

            clean_name = name.strip()
            for value in values:
                if isinstance(value, str) and value.strip():
                    rows.append(
                        {
                            "product_sku": sku,
                            "name": clean_name,
                            "value": value.strip(),
                        }
                    )
        return rows

    async def _persist_record(
        self,
        *,
        record: dict[str, Any],
        description_rows: list[dict[str, str]],
    ) -> tuple[bool, int]:
        """Persist a single product and its description rows in one transaction."""
        sku = record["sku"]
        try:
            stmt = insert(Product).values([record])
            update_cols = {
                column.name: getattr(stmt.excluded, column.name)
                for column in Product.__table__.columns
                if column.name not in {"id"}
            }
            stmt = stmt.on_conflict_do_update(
                index_elements=["sku"],
                set_=update_cols,
            )
            await self.db.execute(stmt)

            await self.db.execute(
                delete(ProductAttributes).where(ProductAttributes.product_sku == sku)
            )
            if description_rows:
                await self.db.execute(
                    sa_insert(ProductAttributes).values(description_rows)
                )

            await self.db.commit()
            return True, len(description_rows)
        except Exception:
            await self.db.rollback()
            return False, 0

    async def sync_products(
        self,
        *,
        account_source: str,
        limit: int,
        max_pages: int | None,
    ) -> dict[str, Any]:
        """Fetch OTTO products by page and persist them into local DB tables.

        Returns counters that summarize fetch, upsert, attribute writes, failures,
        and total pages processed.
        """
        total_fetched = 0
        total_upserted = 0
        total_descriptions_written = 0
        total_failed = 0
        page = 0

        while True:
            if max_pages is not None and page >= max_pages:
                break

            payload = {"page": page, "limit": limit}
            response = await self.product_service.get_products(payload)
            items = self._extract_collection(response)
            if not items:
                break

            total_fetched += len(items)
            for item in items:
                record = self._to_db_record(item, account_source)
                if not record:
                    total_failed += 1
                    continue

                description_rows = self._to_description_records(item)
                ok, written_descriptions = await self._persist_record(
                    record=record,
                    description_rows=description_rows,
                )
                if ok:
                    total_upserted += 1
                    total_descriptions_written += written_descriptions
                else:
                    total_failed += 1

            page += 1

        return {
            "success": True,
            "accountSource": account_source,
            "fetched": total_fetched,
            "upserted": total_upserted,
            "descriptionsWritten": total_descriptions_written,
            "failed": total_failed,
            "pagesProcessed": page,
        }
