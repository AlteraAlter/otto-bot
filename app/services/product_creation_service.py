import json
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.schemas.product import ProductCreate
from app.schemas.product_creation import ProductCreationIssue
from app.services.product_service import ProductService
from generate_seo_descriptions import build_seo_description, decode_with_fallback
from normalize_product_to_schema import build_normalized_product


@dataclass
class ProductCreationResult:
    source_items: int
    normalized_items: int
    created_items: int
    skipped_items: int
    issues: list[ProductCreationIssue]


class ProductCreationService:
    def __init__(self, product_service: ProductService):
        self.product_service = product_service

    def parse_json_bytes(self, raw: bytes) -> list[dict[str, Any]]:
        text, _encoding = decode_with_fallback(raw)
        payload = json.loads(text)

        if isinstance(payload, dict):
            payload = [payload]

        if not isinstance(payload, list):
            raise ValueError("JSON root must be an object or an array of objects")

        records: list[dict[str, Any]] = []
        for idx, item in enumerate(payload):
            if not isinstance(item, dict):
                raise ValueError(f"Item at index {idx} must be a JSON object")
            records.append(item)
        return records

    def normalize_and_validate(
        self,
        source_items: list[dict[str, Any]],
        *,
        max_chars: int,
    ) -> tuple[list[tuple[int, dict[str, Any]]], list[ProductCreationIssue]]:
        issues: list[ProductCreationIssue] = []
        validated: list[tuple[int, dict[str, Any]]] = []

        for index, item in enumerate(source_items):
            try:
                seo_html = build_seo_description(item, max_chars=max_chars)
                normalized = build_normalized_product(item=item, seo_html=seo_html)
                normalized = self._sanitize_optional_fields(normalized)
            except Exception as exc:
                issues.append(
                    ProductCreationIssue(
                        index=index,
                        stage="normalize",
                        message=f"Normalization failed: {exc}",
                    )
                )
                continue

            try:
                model = ProductCreate.model_validate(normalized)
                validated.append((index, model.model_dump(mode="json", exclude_none=True)))
            except ValidationError as exc:
                errors = exc.errors()
                first = errors[0] if errors else None
                loc = " -> ".join(str(part) for part in (first.get("loc") if first else []))
                msg = first.get("msg") if first else str(exc)
                issues.append(
                    ProductCreationIssue(
                        index=index,
                        stage="validate",
                        message=f"{loc}: {msg}" if loc else str(msg),
                    )
                )

        return validated, issues

    @staticmethod
    def _sanitize_optional_fields(payload: dict[str, Any]) -> dict[str, Any]:
        order = payload.get("order")
        if isinstance(order, dict):
            max_order = order.get("maxOrderQuantity")
            if not isinstance(max_order, dict):
                payload.pop("order", None)
                return payload

            quantity = max_order.get("quantity")
            period = max_order.get("periodInDays")
            valid_quantity = isinstance(quantity, int) and quantity > 0
            valid_period = isinstance(period, int) and period > 0
            if not (valid_quantity and valid_period):
                payload.pop("order", None)
        return payload

    async def create_products(
        self, payloads: list[tuple[int, dict[str, Any]]]
    ) -> tuple[int, list[ProductCreationIssue]]:
        issues: list[ProductCreationIssue] = []
        created = 0

        for source_index, payload in payloads:
            try:
                await self.product_service.create_or_update_products(payload)
                created += 1
            except Exception as exc:
                issues.append(
                    ProductCreationIssue(
                        index=source_index,
                        stage="create",
                        message=f"Backend create failed: {exc}",
                    )
                )

        return created, issues

    def validate_prepared_payloads(
        self, payloads: list[dict[str, Any]]
    ) -> tuple[list[tuple[int, dict[str, Any]]], list[ProductCreationIssue]]:
        issues: list[ProductCreationIssue] = []
        validated: list[tuple[int, dict[str, Any]]] = []

        for index, payload in enumerate(payloads):
            try:
                model = ProductCreate.model_validate(payload)
                validated.append((index, model.model_dump(mode="json", exclude_none=True)))
            except ValidationError as exc:
                errors = exc.errors()
                first = errors[0] if errors else None
                loc = " -> ".join(str(part) for part in (first.get("loc") if first else []))
                msg = first.get("msg") if first else str(exc)
                issues.append(
                    ProductCreationIssue(
                        index=index,
                        stage="validate",
                        message=f"{loc}: {msg}" if loc else str(msg),
                    )
                )

        return validated, issues

    async def prepare_upload(
        self, raw: bytes, *, max_chars: int
    ) -> tuple[int, list[tuple[int, dict[str, Any]]], list[ProductCreationIssue]]:
        source_items = self.parse_json_bytes(raw)
        validated_payloads, issues = self.normalize_and_validate(
            source_items,
            max_chars=max_chars,
        )
        return len(source_items), validated_payloads, issues

    async def process_upload(self, raw: bytes, *, max_chars: int) -> ProductCreationResult:
        source_count, validated_payloads, prepare_issues = await self.prepare_upload(
            raw,
            max_chars=max_chars,
        )

        created_items, create_issues = await self.create_products(validated_payloads)
        issues = prepare_issues + create_issues

        return ProductCreationResult(
            source_items=source_count,
            normalized_items=len(validated_payloads),
            created_items=created_items,
            skipped_items=source_count - created_items,
            issues=issues,
        )
