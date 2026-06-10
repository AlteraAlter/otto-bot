"""Normalize raw Afterbuy product rows into the OTTO payload shape."""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from typing import Any


def _pick_text(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _parse_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    text = str(value).strip().replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return default
    try:
        return float(match.group(0))
    except ValueError:
        return default


def _parse_specifics(xml_data: Any) -> dict[str, str]:
    if not isinstance(xml_data, str) or not xml_data.strip():
        return {}

    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError:
        return {}

    result: dict[str, str] = {}
    for item in root.iter():
        children = list(item)
        if len(children) < 2:
            continue
        name = (children[0].text or "").strip()
        value = (children[1].text or "").strip()
        if name and value:
            result[name] = value
    return result


def _direct_attributes(source: dict[str, Any], specifics: dict[str, str]) -> list[dict[str, Any]]:
    candidates = {
        "Breite": _pick_text(source.get("Breite"), specifics.get("Breite")),
        "Tiefe": _pick_text(source.get("Länge"), source.get("Tiefe"), specifics.get("Tiefe")),
        "Höhe": _pick_text(source.get("Höhe"), specifics.get("Höhe")),
        "Wohnraum": _pick_text(source.get("Zimmer"), specifics.get("Zimmer")),
        "Material": _pick_text(source.get("Material"), specifics.get("Material")),
        "Farbe": _pick_text(source.get("Farbe"), specifics.get("Farbe")),
    }
    return [
        {"name": name, "values": [value], "additional": True}
        for name, value in candidates.items()
        if value
    ]


def _media_assets(source: dict[str, Any]) -> list[dict[str, str]]:
    assets: list[dict[str, str]] = []
    for key, value in source.items():
        key_text = str(key).lower()
        if not any(token in key_text for token in ("image", "bild", "picture", "foto", "media")):
            continue
        location = _pick_text(value)
        if location and (location.startswith("http://") or location.startswith("https://")):
            assets.append({"type": "IMAGE", "location": location})

    direct = source.get("mediaAssets")
    if isinstance(direct, list):
        for item in direct:
            if not isinstance(item, dict):
                continue
            location = _pick_text(item.get("location"), item.get("filename"), item.get("url"))
            if location:
                assets.append({"type": str(item.get("type") or "IMAGE"), "location": location})

    seen: set[str] = set()
    unique: list[dict[str, str]] = []
    for item in assets:
        if item["location"] in seen:
            continue
        seen.add(item["location"])
        unique.append(item)
    return unique


def _description(source: dict[str, Any], specifics: dict[str, str], max_chars: int = 2000) -> str:
    title = _pick_text(source.get("Artikelbeschreibung"), source.get("title"), source.get("name"))
    details = [
        title,
        _pick_text(source.get("Beschreibung"), source.get("description")),
    ]
    facts = []
    for key in ("Material", "Farbe", "Breite", "Höhe", "Länge", "Tiefe", "Zimmer"):
        value = _pick_text(source.get(key), specifics.get(key))
        if value:
            facts.append(f"{key}: {value}")
    if facts:
        details.append("; ".join(facts))

    text = ". ".join(part for part in details if part)
    text = html.unescape(re.sub(r"\s+", " ", text)).strip()
    if not text:
        text = "Produktbeschreibung folgt."
    return text[:max_chars]


def build_normalized_product(
    source: dict[str, Any],
    description_html: str | None = None,
) -> dict[str, Any]:
    """Build the minimal valid product payload used by the factory flow."""
    specifics = _parse_specifics(source.get("CustomItemSpecifics"))
    ean = _pick_text(source.get("EAN"), source.get("ean"), source.get("sku")) or ""
    title = _pick_text(source.get("Artikelbeschreibung"), source.get("title"), ean)
    category = (
        _pick_text(
            source.get("category"),
            source.get("Produktkategorie"),
            source.get("productCategory"),
        )
        or "Regal"
    )
    description = description_html or _description(source, specifics)

    return {
        "productReference": ean,
        "sku": ean,
        "ean": ean or None,
        "productDescription": {
            "brandId": (
                _pick_text(source.get("brandId"), source.get("brand"), "JVmoebel")
                or "JVmoebel"
            ),
            "productLine": title,
            "category": category,
            "bulletPoints": [],
            "attributes": _direct_attributes(source, specifics),
            "description": description,
        },
        "pricing": {
            "standardPrice": {
                "amount": _parse_float(source.get("Startpreis"), 0.0),
                "currency": "EUR",
            },
            "vat": "FULL",
        },
        "mediaAssets": _media_assets(source),
    }


__all__ = ["build_normalized_product"]
