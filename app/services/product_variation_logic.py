"""Pure helpers for product variation matrix generation."""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass
from itertools import product as cartesian_product
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urljoin


VARIANT_STATUSES = {
    "draft",
    "pending_generation",
    "generating_image",
    "ready",
    "failed",
    "manual_override",
}


@dataclass(frozen=True)
class VariationDimension:
    attribute_id: str
    name: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class VariantCombination:
    key: str
    values: tuple[tuple[str, str, str], ...]

    def as_snapshot(self) -> list[dict[str, str]]:
        return [
            {"attributeId": attribute_id, "name": name, "value": value}
            for attribute_id, name, value in self.values
        ]


def normalize_variation_value(value: Any) -> str:
    """Normalize a variation value for stable equality and key generation."""
    if isinstance(value, Mapping):
        for key in ("id", "valueId", "value_id", "key", "value", "name"):
            candidate = value.get(key)
            if candidate is not None and str(candidate).strip():
                value = candidate
                break
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", " ", text)


def normalize_field_token(value: Any) -> str:
    text = str(value or "").lower()
    text = re.sub(r"['\"`]", "", text)
    text = re.sub(r"[()[\]{}]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def is_supported_variation_attribute(name: Any) -> bool:
    """Only the primary color/material fields may create product variants."""

    token = normalize_field_token(name)
    return token in {
        "farbe",
        "color",
        "colour",
        "цвет",
        "material",
        "материал",
    }


def split_attribute_values(value: Any) -> list[str]:
    """Read OTTO attribute values from lists or comma/newline separated text."""
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        raw_values = list(value)
    else:
        raw_values = re.split(r"[,;\n]+", str(value))

    values: list[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        text = str(raw or "").strip()
        if not text:
            continue
        key = normalize_variation_value(text)
        if key in seen:
            continue
        seen.add(key)
        values.append(text)
    return values


def build_combination_key(values: Mapping[str, Any]) -> str:
    """Build an order-independent deterministic key from attribute/value pairs."""
    pairs = [
        {
            "attribute_id": str(attribute_id),
            "value": normalize_variation_value(value),
        }
        for attribute_id, value in values.items()
        if str(attribute_id).strip() and normalize_variation_value(value)
    ]
    pairs.sort(key=lambda item: item["attribute_id"])
    return json.dumps(pairs, ensure_ascii=False, separators=(",", ":"))


def build_variant_combinations(
    dimensions: Sequence[VariationDimension],
) -> list[VariantCombination]:
    """Return the cartesian product for variation-capable dimensions."""
    clean_dimensions = [
        dimension
        for dimension in dimensions
        if dimension.attribute_id and dimension.name and len(dimension.values) > 0
    ]
    if not clean_dimensions:
        return []

    combinations: list[VariantCombination] = []
    value_lists = [dimension.values for dimension in clean_dimensions]
    for selected_values in cartesian_product(*value_lists):
        mapping = {
            dimension.attribute_id: selected_values[index]
            for index, dimension in enumerate(clean_dimensions)
        }
        tuples = tuple(
            (
                dimension.attribute_id,
                dimension.name,
                selected_values[index],
            )
            for index, dimension in enumerate(clean_dimensions)
        )
        combinations.append(
            VariantCombination(key=build_combination_key(mapping), values=tuples)
        )
    return combinations


def source_combination_key(dimensions: Sequence[VariationDimension]) -> str | None:
    """Use the first current value in each dimension as the source variant."""
    mapping = {
        dimension.attribute_id: dimension.values[0]
        for dimension in dimensions
        if dimension.values
    }
    return build_combination_key(mapping) if mapping else None


def preview_variant_generation(
    dimensions: Sequence[VariationDimension],
    existing_combination_keys: Iterable[str] = (),
    *,
    include_source_as_existing: bool = True,
) -> dict[str, Any]:
    combinations = build_variant_combinations(dimensions)
    all_keys = {combination.key for combination in combinations}
    existing_keys = set(existing_combination_keys) & all_keys
    source_key = source_combination_key(dimensions)
    if include_source_as_existing and source_key in all_keys:
        existing_keys.add(source_key)
    new_keys = all_keys - existing_keys
    multi_value_attributes = [
        dimension.name for dimension in dimensions if len(dimension.values) > 1
    ]
    return {
        "totalCombinations": len(combinations),
        "existingCombinations": len(existing_keys),
        "newCombinations": len(new_keys),
        "sourceCombinationKey": source_key,
        "variationAttributes": [
            {
                "attributeId": dimension.attribute_id,
                "name": dimension.name,
                "values": list(dimension.values),
                "fixed": len(dimension.values) == 1,
            }
            for dimension in dimensions
        ],
        "multiValueAttributes": multi_value_attributes,
        "combinationKeys": [combination.key for combination in combinations],
    }


def _copy_without_variant_fields(product: Mapping[str, Any]) -> dict[str, Any]:
    payload = copy.deepcopy(dict(product))
    payload.pop("variants", None)
    payload.pop("variantSummary", None)
    payload.pop("variantMeta", None)
    return payload


def _apply_combination_to_product(
    product: dict[str, Any],
    combination: VariantCombination,
) -> dict[str, Any]:
    description = product.get("productDescription")
    if not isinstance(description, dict):
        return product

    attributes = description.get("attributes")
    if not isinstance(attributes, list):
        return product

    by_id = {attribute_id: value for attribute_id, _name, value in combination.values}
    by_name = {
        normalize_field_token(name): value
        for _attribute_id, name, value in combination.values
    }

    next_attributes: list[Any] = []
    for item in attributes:
        if not isinstance(item, dict):
            next_attributes.append(item)
            continue
        attr_id = str(
            item.get("attribute_id")
            or item.get("attributeId")
            or item.get("id")
            or item.get("attributeKey")
            or ""
        ).strip()
        name_key = normalize_field_token(item.get("name"))
        value = by_id.get(attr_id) if attr_id else None
        if value is None:
            value = by_name.get(name_key)
        if value is None:
            next_attributes.append(item)
            continue
        next_attributes.append({**item, "values": [value]})

    product["productDescription"] = {**description, "attributes": next_attributes}
    return product


def build_variant_product_payload(
    source_product: Mapping[str, Any],
    combination: VariantCombination,
    *,
    sku: str | None = None,
    ean: str | None = None,
    price: float | int | str | None = None,
    image_url: str | None = None,
    media_assets: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Create one OTTO product payload for a specific variation combination."""
    payload = _copy_without_variant_fields(source_product)
    payload = _apply_combination_to_product(payload, combination)

    if sku is not None:
        payload["sku"] = sku
    if ean is not None:
        payload["ean"] = ean or None

    if price is not None:
        pricing = payload.get("pricing")
        if isinstance(pricing, dict):
            standard_price = pricing.get("standardPrice")
            if isinstance(standard_price, dict):
                try:
                    standard_price["amount"] = float(price)
                except (TypeError, ValueError):
                    pass

    if media_assets is not None:
        payload["mediaAssets"] = [dict(item) for item in media_assets]
    elif image_url:
        payload["mediaAssets"] = [{"type": "IMAGE", "location": image_url}]

    return payload


def active_variant_items(product: Mapping[str, Any]) -> list[dict[str, Any]]:
    variants = product.get("variants")
    if not isinstance(variants, list):
        return []
    result: list[dict[str, Any]] = []
    for item in variants:
        if not isinstance(item, dict):
            continue
        if item.get("isDeleted") is True or item.get("deleted") is True:
            continue
        if item.get("active") is False:
            continue
        result.append(item)
    return result


def _absolute_media_location(location: Any, media_base_url: str | None) -> str:
    text = str(location or "").strip()
    if not text:
        return ""
    if text.startswith(("http://", "https://")):
        return text
    if media_base_url and text.startswith("/"):
        return urljoin(media_base_url.rstrip("/") + "/", text.lstrip("/"))
    return ""


def _external_media_assets(
    value: Any,
    *,
    media_base_url: str | None = None,
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    assets: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        location = _absolute_media_location(
            item.get("location") or item.get("filename"),
            media_base_url,
        )
        if location:
            asset = dict(item)
            asset["location"] = location
            assets.append(asset)
    return assets


def expand_product_variants_for_otto(
    product: Mapping[str, Any],
    *,
    media_base_url: str | None = None,
) -> list[dict[str, Any]]:
    """Return regular OTTO product payloads, expanding draft variants if present."""
    variants = active_variant_items(product)
    if not variants:
        return [_copy_without_variant_fields(product)]

    expanded: list[dict[str, Any]] = []
    latest_base_payload = _copy_without_variant_fields(product)
    latest_media_assets = _external_media_assets(
        latest_base_payload.get("mediaAssets"),
        media_base_url=media_base_url,
    )
    product_reference = str(product.get("productReference") or "").strip()
    for variant in variants:
        combination_items = variant.get("combination")
        combination = VariantCombination(
            key=str(variant.get("combinationKey") or variant.get("combination_key") or ""),
            values=tuple(
                (
                    str(item.get("attributeId") or item.get("attribute_id") or item.get("id") or item.get("name") or ""),
                    str(item.get("name") or item.get("attributeName") or item.get("attributeId") or ""),
                    str(item.get("value") or ""),
                )
                for item in combination_items
                if isinstance(item, dict)
            )
            if isinstance(combination_items, list)
            else tuple(),
        )
        variant_payload = copy.deepcopy(latest_base_payload)

        if combination.values:
            variant_payload = _apply_combination_to_product(variant_payload, combination)
        if product_reference:
            variant_payload["productReference"] = product_reference
        variant_sku = str(variant.get("sku") or variant_payload.get("sku") or "").strip()
        variant_ean = str(variant.get("ean") or variant_payload.get("ean") or "").strip()
        variant_payload["sku"] = variant_sku
        variant_payload["ean"] = variant_ean or None

        if variant.get("price") not in (None, ""):
            variant_payload = build_variant_product_payload(
                variant_payload,
                combination,
                price=variant.get("price"),
            )

        media_assets = _external_media_assets(
            variant.get("mediaAssets"),
            media_base_url=media_base_url,
        )
        if media_assets:
            variant_payload["mediaAssets"] = media_assets
        else:
            image_url = str(variant.get("imageUrl") or variant.get("image_url") or "").strip()
            absolute_image_url = _absolute_media_location(image_url, media_base_url)
            if absolute_image_url:
                variant_payload["mediaAssets"] = [{"type": "IMAGE", "location": absolute_image_url}]
            elif latest_media_assets:
                variant_payload["mediaAssets"] = copy.deepcopy(latest_media_assets)

        expanded.append(_copy_without_variant_fields(variant_payload))
    return expanded


def expand_products_with_variants(
    products: Sequence[Mapping[str, Any]],
    *,
    media_base_url: str | None = None,
) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for product in products:
        if isinstance(product, Mapping):
            expanded.extend(
                expand_product_variants_for_otto(
                    product,
                    media_base_url=media_base_url,
                )
            )
    return expanded


def validate_variant_export_identifiers(
    products: Sequence[Mapping[str, Any]],
) -> list[dict[str, str]]:
    """Validate active variant SKU/EAN values before export."""
    errors: list[dict[str, str]] = []
    seen_sku: dict[str, str] = {}
    seen_ean: dict[str, str] = {}

    for product in products:
        for payload in expand_product_variants_for_otto(product):
            sku = str(payload.get("sku") or "").strip()
            ean = str(payload.get("ean") or "").strip()
            reference = str(payload.get("productReference") or "-").strip()
            label = sku or ean or reference
            if not sku:
                errors.append(
                    {
                        "variation": label,
                        "code": "missing_sku",
                        "title": "SKU is required for every active variant.",
                        "jsonPath": "sku",
                    }
                )
            elif sku in seen_sku:
                errors.append(
                    {
                        "variation": label,
                        "code": "duplicate_sku",
                        "title": f"SKU duplicates {seen_sku[sku]}.",
                        "jsonPath": "sku",
                    }
                )
            else:
                seen_sku[sku] = label

            if not ean:
                errors.append(
                    {
                        "variation": label,
                        "code": "missing_ean",
                        "title": "EAN is required for every active variant.",
                        "jsonPath": "ean",
                    }
                )
            elif ean in seen_ean:
                errors.append(
                    {
                        "variation": label,
                        "code": "duplicate_ean",
                        "title": f"EAN duplicates {seen_ean[ean]}.",
                        "jsonPath": "ean",
                    }
                )
            else:
                seen_ean[ean] = label

    return errors
