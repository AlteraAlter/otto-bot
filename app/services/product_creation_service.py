"""File-upload product creation pipeline.

This service converts raw source JSON into OTTO-compatible product payloads.
Pipeline stages:
1. Decode + parse uploaded bytes.
2. Normalize each source item (SEO text, attributes, category mapping).
3. Validate against `ProductCreate` schema.
4. Send valid payloads to OTTO create/upsert endpoint.

Issues from each stage are collected with source item indices so callers can
return actionable feedback to users.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.mapper import get_default_category_mapper
from app.mapper.normalizer import build_normalized_product
from app.mapper.seo import build_seo_description, decode_with_fallback
from app.schemas.product import ProductCreate
from app.schemas.product_creation import ProductCreationIssue
from app.services.product_service import ProductService


@dataclass
class ProductCreationResult:
    """Summary of the end-to-end upload processing and creation outcome."""

    source_items: int
    normalized_items: int
    created_items: int
    skipped_items: int
    issues: list[ProductCreationIssue]


class ProductCreationService:
    """Coordinate normalization, validation, and creation for uploaded products."""

    def __init__(self, product_service: ProductService):
        """Initialize service and local category cache."""
        self.product_service = product_service
        self._valid_categories_cache: set[str] | None = None

    @staticmethod
    def _extract_categories(payload: Any) -> set[str]:
        """Recursively collect category names from OTTO category API payload shapes."""
        found: set[str] = set()
        if isinstance(payload, str):
            cleaned = payload.strip()
            if cleaned:
                found.add(cleaned)
            return found

        if isinstance(payload, list):
            for item in payload:
                found.update(ProductCreationService._extract_categories(item))
            return found

        if isinstance(payload, dict):
            groups = payload.get("categoryGroups")
            if isinstance(groups, list):
                for group in groups:
                    found.update(ProductCreationService._extract_categories(group))

            categories = payload.get("categories")
            if isinstance(categories, list):
                for item in categories:
                    found.update(ProductCreationService._extract_categories(item))

            for key in ("category", "name", "label", "categoryName"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    found.add(value.strip())

        return found

    @staticmethod
    def _trim_product_line(payload: dict[str, Any], max_len: int = 70) -> None:
        """Ensure `productLine` satisfies upstream length constraints."""
        product_description = payload.get("productDescription")
        if not isinstance(product_description, dict):
            return
        product_line = product_description.get("productLine")
        if isinstance(product_line, str):
            cleaned = product_line.strip()
            product_description["productLine"] = (
                cleaned[:max_len] if len(cleaned) > max_len else cleaned
            )

    @staticmethod
    def _category_aliases() -> dict[str, str]:
        """Return fallback singular/plural aliases for known category names."""
        return {
            "Tische": "Tisch",
            "Sideboards": "Sideboard",
            "Regale": "Regal",
            "Schränke": "Schrank",
            "Stühle": "Stuhl",
            "Sofas": "Sofa",
            "Sitzbänke": "Sitzbank",
            "Kissen": "Kissen",
            "Spiegel": "Spiegel",
            "Betten": "Bett",
            "Matratzen": "Matratze",
        }

    @staticmethod
    def _extract_source_field(item: dict[str, Any], *keys: str) -> str | None:
        """Return the first non-empty string from a list of possible source keys."""
        for key in keys:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @classmethod
    def _mapped_category_from_source(cls, item: dict[str, Any]) -> str | None:
        """Infer OTTO category from raw source text fields using `CategoryMapper`."""
        mapper = get_default_category_mapper()
        return mapper.map_category(
            product_type=cls._extract_source_field(
                item, "Produktart", "Category", "Type", "type"
            ),
            title=cls._extract_source_field(
                item, "Artikelbeschreibung", "Title", "Titel", "TranslatedDescription"
            ),
            brand=cls._extract_source_field(item, "Marke", "Brand"),
            room=cls._extract_source_field(item, "Zimmer", "Room"),
            style=cls._extract_source_field(item, "Stil", "Style"),
        )

    @staticmethod
    def _normalize_gender_value(raw: str) -> str | None:
        """Map raw gender text to OTTO-compatible enum-like display values."""
        value = raw.strip().lower()
        value = (
            value.replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )

        if any(token in value for token in ("damen", "weiblich", "frau")):
            return "Damen"
        if any(token in value for token in ("herren", "maennlich", "mann")):
            return "Herren"
        if "unisex" in value:
            return "Unisex"
        if any(
            token in value for token in ("kinder", "kind", "baby", "maedchen", "jungen")
        ):
            return "Kinder"
        return None

    @staticmethod
    def _normalize_base_color_value(raw: str) -> str | None:
        """Normalize free-form base color values to canonical attribute strings."""
        value = raw.strip().lower()
        value = (
            value.replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )
        known = {
            "weiss": "Weiss",
            "grau": "Grau",
            "schwarz": "Schwarz",
            "braun": "Braun",
            "beige": "Beige",
            "blau": "Blau",
            "gruen": "Gruen",
            "rot": "Rot",
            "gelb": "Gelb",
            "rosa": "Rosa",
            "lila": "Lila",
            "silber": "Silber",
            "gold": "Gold",
            "transparent": "Transparent",
            "mehrfarbig": "Mehrfarbig",
        }
        return known.get(value)

    @classmethod
    def _sanitize_product_attributes(cls, payload: dict[str, Any]) -> None:
        """Clean and constrain product attributes before schema validation/create.

        The method removes malformed attributes, enforces single-value fields,
        normalizes selected values (like gender), and drops fields that cannot be
        validated reliably across categories (for example `Grundfarbe`).
        """
        product_description = payload.get("productDescription")
        if not isinstance(product_description, dict):
            return

        attributes = product_description.get("attributes")
        if not isinstance(attributes, list):
            return

        single_value_names = {"Bezug", "Geschlecht", "Anzahl Teile", "Grundfarbe"}
        cleaned_attributes: list[dict[str, Any]] = []

        for attr in attributes:
            if not isinstance(attr, dict):
                continue

            name = attr.get("name")
            if not isinstance(name, str) or not name.strip():
                continue

            values = attr.get("values")
            if not isinstance(values, list):
                continue

            normalized_values = [
                v.strip() for v in values if isinstance(v, str) and v.strip()
            ]
            if not normalized_values:
                continue

            if name in single_value_names:
                normalized_values = normalized_values[:1]

            if name == "Anzahl Teile":
                match = re.search(r"\d+", normalized_values[0])
                if not match:
                    continue
                normalized_values = [match.group(0)]

            if name == "Geschlecht":
                normalized_gender = cls._normalize_gender_value(normalized_values[0])
                if not normalized_gender:
                    continue
                normalized_values = [normalized_gender]

            if name == "Grundfarbe":
                # Allowed values vary by category; drop this attribute if we cannot
                # guarantee a category-valid enum value.
                continue

            attr["values"] = normalized_values
            cleaned_attributes.append(attr)

        product_description["attributes"] = cleaned_attributes

    async def _get_valid_categories(self) -> set[str]:
        """Load valid categories from OTTO, falling back to local bundled list."""
        if self._valid_categories_cache is not None:
            return self._valid_categories_cache

        try:
            categories = await self.product_service.get_categories(
                {"page": 0, "limit": 2000}
            )
        except Exception:
            categories = []

        extracted = self._extract_categories(categories)
        if not extracted:
            local_file = (
                Path(__file__).resolve().parents[1] / "mapper" / "available_cats.json"
            )
            if local_file.exists():
                try:
                    extracted = self._extract_categories(
                        json.loads(local_file.read_text(encoding="utf-8"))
                    )
                except Exception:
                    extracted = set()

        self._valid_categories_cache = extracted

        return self._valid_categories_cache

    async def _normalize_category_for_payload(self, payload: dict[str, Any]) -> None:
        """Replace invalid category values with safe/known alternatives."""
        product_description = payload.get("productDescription")
        if not isinstance(product_description, dict):
            return

        category = product_description.get("category")
        if not isinstance(category, str) or not category.strip():
            return

        valid_categories = await self._get_valid_categories()
        category_clean = category.strip()

        if category_clean in valid_categories:
            product_description["category"] = category_clean
            return

        alias = self._category_aliases().get(category_clean)
        if alias and alias in valid_categories:
            product_description["category"] = alias
            return

        if "KOB Set-Artikel" in valid_categories:
            product_description["category"] = "KOB Set-Artikel"
            return

        if valid_categories:
            product_description["category"] = sorted(valid_categories)[0]

    def parse_json_bytes(self, raw: bytes) -> list[dict[str, Any]]:
        """Decode uploaded bytes and enforce object-or-array JSON root semantics."""
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
        """Normalize each source item and validate it against `ProductCreate`.

        Returns:
            A list of `(source_index, validated_payload)` tuples and collected
            stage-specific issues for items that failed.
        """
        issues: list[ProductCreationIssue] = []
        validated: list[tuple[int, dict[str, Any]]] = []

        for index, item in enumerate(source_items):
            try:
                seo_html = build_seo_description(item, max_chars=max_chars)
                normalized = build_normalized_product(item=item, seo_html=seo_html)
                mapped_category = self._mapped_category_from_source(item)
                if mapped_category and isinstance(
                    normalized.get("productDescription"), dict
                ):
                    normalized["productDescription"]["category"] = mapped_category
                self._sanitize_product_attributes(normalized)
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
                validated.append(
                    (index, model.model_dump(mode="json", exclude_none=True))
                )
            except ValidationError as exc:
                errors = exc.errors()
                first = errors[0] if errors else None
                loc = " -> ".join(
                    str(part) for part in (first.get("loc") if first else [])
                )
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
        """Drop optional sections that are structurally present but invalid."""
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
        """Create validated payloads in OTTO and map transport errors to issues."""
        issues: list[ProductCreationIssue] = []
        if not payloads:
            return 0, issues

        payload_list = [payload for _index, payload in payloads]
        for payload in payload_list:
            self._sanitize_product_attributes(payload)
            self._trim_product_line(payload, max_len=70)
            await self._normalize_category_for_payload(payload)

        try:
            await self.product_service.create_or_update_products(payload_list)
            return len(payloads), issues
        except Exception as exc:
            for source_index, _payload in payloads:
                issues.append(
                    ProductCreationIssue(
                        index=source_index,
                        stage="create",
                        message=f"Backend create failed: {exc}",
                    )
                )
            return 0, issues

    def validate_prepared_payloads(
        self, payloads: list[dict[str, Any]]
    ) -> tuple[list[tuple[int, dict[str, Any]]], list[ProductCreationIssue]]:
        """Validate user-edited prepared payloads before create-from-prepared call."""
        issues: list[ProductCreationIssue] = []
        validated: list[tuple[int, dict[str, Any]]] = []

        for index, payload in enumerate(payloads):
            try:
                self._sanitize_product_attributes(payload)
                model = ProductCreate.model_validate(payload)
                validated.append(
                    (index, model.model_dump(mode="json", exclude_none=True))
                )
            except ValidationError as exc:
                errors = exc.errors()
                first = errors[0] if errors else None
                loc = " -> ".join(
                    str(part) for part in (first.get("loc") if first else [])
                )
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
        """Run parse + normalize + validate stages without creating products."""
        source_items = self.parse_json_bytes(raw)
        validated_payloads, issues = self.normalize_and_validate(
            source_items,
            max_chars=max_chars,
        )
        return len(source_items), validated_payloads, issues

    async def process_upload(
        self, raw: bytes, *, max_chars: int
    ) -> ProductCreationResult:
        """Run the full upload pipeline, including product creation in OTTO."""
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
