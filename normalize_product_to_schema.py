#!/usr/bin/env python3
"""
Normalize one product record from a JSON array into a marketplace-style schema.

Usage:
  Set values in `NormalizeConfig` and run:
  python normalize_product_to_schema.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import ijson

from generate_seo_descriptions import (
    build_seo_description,
    decode_with_fallback,
    is_meaningful,
    normalize_key,
    sanitize_value,
)

PART_COUNT_ALIASES = [
    "Anzahl der Teile",
    "Anzahl Teile",
    "Anzahl der Einheiten",
    "Anzahl",
]
SET_INCLUDES_ALIASES = ["Set enthält", "Set enthaelt"]

NAME_ALIASES = ["Produktart", "Name", "Produktname", "Titel", "Title"]
TITLE_ALIASES = ["Artikelbeschreibung", "TranslatedDescription"]

MATERIAL_ALIASES = ["Material", "Gestellmaterial", "Polsterstoff", "Bezug"]
COLOR_ALIASES = ["Farbe", "Color"]
STYLE_ALIASES = ["Stil", "Style"]
FEATURE_ALIASES = ["Besonderheiten", "Besondere Merkmale", "Features"]

WIDTH_ALIASES = ["Breite", "Width"]
# Keep legacy mojibake aliases for input compatibility; output uses clean labels.
HEIGHT_ALIASES = ["Höhe", "Hoehe", "Hohe", "HГ¶he", "Height"]
LENGTH_ALIASES = ["Länge", "Laenge", "Lange", "LГ¤nge", "Length"]
DEPTH_ALIASES = ["Tiefe", "Depth"]

DIMENSION_BULLET_FIELDS = [
    ("Breite", WIDTH_ALIASES),  
    ("Hoehe", HEIGHT_ALIASES),
    ("Laenge", LENGTH_ALIASES),
    ("Tiefe", DEPTH_ALIASES),
]

ATTRIBUTE_CANDIDATES = [
    ("Anzahl Teile", ["Anzahl der Teile", "Anzahl Teile", "Anzahl der Einheiten"]),
    ("Besondere Merkmale", ["Besondere Merkmale", "Besonderheiten", "Features"]),
    ("Bezug", ["Bezug", "Material", "Gestellmaterial", "Polsterstoff"]),
    ("Breite", WIDTH_ALIASES),
    ("Farbe", COLOR_ALIASES),
    ("Geschlecht", ["Geschlecht", "Abteilung", "Gender"]),
    ("Grundfarbe", ["Grundfarbe", "Basisfarbe"]),
    (
        "Hinweis Massangaben",
        ["Hinweis Massangaben", "Hinweis Maßangaben", "Hinweis MaГџangaben"],
    ),
    ("Hoehe", HEIGHT_ALIASES),
    ("Lieferzustand", ["Lieferzustand", "Montagezustand", "Montage erforderlich"]),
    ("Markeninformationen", ["Markeninformationen", "BrandDescription"]),
    ("Serie", ["Serie", "ProductLine", "Produktart"]),
    ("Tiefe", DEPTH_ALIASES),
    ("Stil", STYLE_ALIASES),
    ("Zimmer", ["Zimmer", "Room"]),
]
DIMENSION_ATTRIBUTE_NAMES = {"Breite", "Hoehe", "Tiefe"}

PART_COUNT_PATTERN = re.compile(r"\b(\d{1,2})\s*(?:tlg|teilig|teile?)\b", re.I)
ISO_DATETIME_Z_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$"
)
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
SCALAR_SPLIT_PATTERN = re.compile(r"[|;]")
MEDIA_SPLIT_PATTERN = re.compile(r"[|,;]")

ATTRIBUTE_LABEL_MAP = {
    "Farbe": "color",
    "Grundfarbe": "baseColor",
    "Material": "material",
    "Bezug": "cover",
    "Stil": "style",
    "Zimmer": "room",
    "Geschlecht": "gender",
    "Besondere Merkmale": "feature",
    "Serie": "series",
}

OTTO_FALLBACK_CATEGORY = "KOB Set-Artikel"
OTTO_ALLOWED_CATEGORIES = {
    "Arbeitsmöbel-Sets",
    "Badewannen",
    "Betten",
    "Bilder",
    "Dekofiguren",
    "Dämmmaterialien",
    "Etagenbetten",
    "Fliesen",
    "Fußbäder",
    "Funkübertragungsgeräte",
    "Garderobenständer",
    "Gartenhäuser",
    "Hocker",
    "Hochbetten",
    "Hängematten",
    "KOB Set-Artikel",
    "Kastenmöbel-Sets",
    "Kissen",
    "Komplettbetten",
    "Küchenspülen",
    "Lattenroste",
    "Leuchten",
    "Matratzen",
    "Regale",
    "Sessel",
    "Schrankbetten",
    "Schränke",
    "Sideboards",
    "Sitzbänke",
    "Sitzmöbel-Sets",
    "Sitzsäcke",
    "Sofas",
    "Spiegel",
    "Stühle",
    "Teppiche",
    "Tische",
    "Topper",
    "Türen",
    "Vasen",
    "WCs",
    "Wasserspiele",
    "Whirlpools",
    "Zielscheiben",
}

OTTO_CATEGORY_RULES: list[tuple[tuple[str, ...], str]] = [
    (("dartscheibe",), "Zielscheiben"),
    (("matratz",), "Matratzen"),
    (("topper",), "Topper"),
    (("lattenrost",), "Lattenroste"),
    (("schrankbett",), "Schrankbetten"),
    (("murphy", "bed"), "Schrankbetten"),
    (("etagenbett",), "Etagenbetten"),
    (("hochbett",), "Hochbetten"),
    (("mittelhohes", "bett"), "Hochbetten"),
    (("boxspringbett",), "Komplettbetten"),
    (("bett", "matratz"), "Komplettbetten"),
    (("bett",), "Betten"),
    (("bed",), "Betten"),
    (("bed", "frame"), "Betten"),
    (("schreibtisch",), "Tische"),
    (("schminktisch",), "Tische"),
    (("desk",), "Tische"),
    (("empfangstresen",), "Tische"),
    (("esstisch",), "Tische"),
    (("esstich",), "Tische"),
    (("dining", "table"), "Tische"),
    (("dressing", "table"), "Tische"),
    (("couchtisch",), "Tische"),
    (("couchttisch",), "Tische"),
    (("beistelltisch",), "Tische"),
    (("side", "table"), "Tische"),
    (("konsole",), "Tische"),
    (("konsolentisch",), "Tische"),
    (("nachttisch",), "Tische"),
    (("night", "table"), "Tische"),
    (("bedside", "table"), "Tische"),
    (("stehtisch",), "Tische"),
    (("konferenztisch",), "Tische"),
    (("sofa",), "Sofas"),
    (("couch",), "Sofas"),
    (("ottomane",), "Sofas"),
    (("sleeper", "sofa"), "Sofas"),
    (("sessel",), "Sessel"),
    (("armchair",), "Sessel"),
    (("haengesessel",), "Sessel"),
    (("barhocker",), "Hocker"),
    (("hocker",), "Hocker"),
    (("bench",), "Sitzbänke"),
    (("sitzbank",), "Sitzbänke"),
    (("stuhl",), "Stühle"),
    (("chair",), "Stühle"),
    (("tv", "lowboard"), "Sideboards"),
    (("tv", "stand"), "Sideboards"),
    (("tv", "staender"), "Sideboards"),
    (("sideboard",), "Sideboards"),
    (("anrichte",), "Sideboards"),
    (("kommode",), "Sideboards"),
    (("kleiderschrank",), "Schränke"),
    (("wardrobe",), "Schränke"),
    (("schrank",), "Schränke"),
    (("cabinet",), "Schränke"),
    (("vitrine",), "Schränke"),
    (("regal",), "Regale"),
    (("wohnwand",), "Regale"),
    (("etagere",), "Regale"),
    (("blumenstaender",), "Regale"),
    (("kleiderstange",), "Garderobenständer"),
    (("garderobe",), "Garderobenständer"),
    (("spiegel",), "Spiegel"),
    (("skulptur",), "Dekofiguren"),
    (("sculpture",), "Dekofiguren"),
    (("figur",), "Dekofiguren"),
    (("figurine",), "Dekofiguren"),
    (("kunstdruck",), "Bilder"),
    (("landscape",), "Bilder"),
    (("bild",), "Bilder"),
    (("vase",), "Vasen"),
    (("teppich",), "Teppiche"),
    (("whirlpool",), "Whirlpools"),
    (("badewanne",), "Badewannen"),
    (("fussbad",), "Fußbäder"),
    (("lendenkissen",), "Kissen"),
    (("gartenhaus",), "Gartenhäuser"),
    (("haengematte",), "Hängematten"),
    (("hangematte",), "Hängematten"),
    (("deckenlampe",), "Leuchten"),
    (("spiegelleuchte",), "Leuchten"),
    (("lampe",), "Leuchten"),
    (("wasserwand",), "Wasserspiele"),
    (("water", "wall"), "Wasserspiele"),
    (("wasserfall",), "Wasserspiele"),
    (("trittschalldaemmung",), "Dämmmaterialien"),
    (("xps",), "Dämmmaterialien"),
    (("fliese",), "Fliesen"),
    (("kompletttuer",), "Türen"),
    (("tuer",), "Türen"),
    (("door",), "Türen"),
    (("aussenkuechenmodul",), "Kastenmöbel-Sets"),
    (("2", "sitzer"), "Sofas"),
    (("3", "sitzer"), "Sofas"),
    (("dreisitzer",), "Sofas"),
    (("waschbecken",), "Küchenspülen"),
    (("spuele",), "Küchenspülen"),
    (("sender",), "Funkübertragungsgeräte"),
    (("transmitter",), "Funkübertragungsgeräte"),
]


@dataclass(frozen=True)
class NormalizeConfig:
    input_path: str | None = None
    input_glob: str = "*.json"
    output_suffix: str = "_NRM"
    skip_normalized_files: bool = True
    max_chars: int = 2000


def read_json(path: Path) -> Any:
    text, _encoding = decode_with_fallback(path.read_bytes())
    return json.loads(text)


def build_lookup(item: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in item.items():
        nk = normalize_key(key)
        if nk and nk not in out and is_meaningful(value):
            out[nk] = value
    return out


def pick_value(lookup: dict[str, Any], aliases: list[str]) -> Any | None:
    for alias in aliases:
        nk = normalize_key(alias)
        if nk in lookup:
            return lookup[nk]
    return None


def as_text(value: Any) -> str | None:
    if not is_meaningful(value):
        return None
    text = sanitize_value(value, max_len=500)
    return text if text else None


def fix_mojibake_german(text: str) -> str:
    replacements = {
        "Г¤": "ä",
        "Г¶": "ö",
        "Гј": "ü",
        "Гџ": "ß",
        "Р“В¤": "ä",
        "Р“В¶": "ö",
        "Р“Вј": "ü",
        "Р“Сџ": "ß",
    }
    out = text
    for broken, fixed in replacements.items():
        out = out.replace(broken, fixed)
    return out


def normalize_for_match(text: str) -> str:
    clean = fix_mojibake_german(text).strip().lower()
    clean = unicodedata.normalize("NFKD", clean)
    clean = "".join(ch for ch in clean if not unicodedata.combining(ch))
    clean = (
        clean.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    clean = re.sub(r"[^a-z0-9]+", " ", clean)
    return re.sub(r"\s+", " ", clean).strip()


def collect_category_source_texts(lookup: dict[str, Any]) -> list[str]:
    raw: list[str] = []
    primary = [
        as_text(pick_value(lookup, ["Produktart", "Category", "Type", "type"])),
        as_text(pick_value(lookup, ["Artikelbeschreibung", "Title", "Titel"])),
        as_text(pick_value(lookup, ["TranslatedDescription"])),
    ]
    raw.extend([text for text in primary if text])
    return dedupe_texts(raw)


def map_to_otto_category(lookup: dict[str, Any]) -> str:
    source_texts = collect_category_source_texts(lookup)
    normalized_texts = [normalize_for_match(text) for text in source_texts if text]

    for text in normalized_texts:
        for keywords, category in OTTO_CATEGORY_RULES:
            if all(keyword in text for keyword in keywords):
                return category if category in OTTO_ALLOWED_CATEGORIES else OTTO_FALLBACK_CATEGORY

    for text in normalized_texts:
        if "set" in text:
            if any(
                token in text
                for token in ("stuhl", "chair", "sessel", "sofa", "couch", "bench", "wohnzimmer")
            ):
                return "Sitzmöbel-Sets"
            if any(token in text for token in ("schrank", "kommode", "sideboard", "wohnwand", "regal", "tv")):
                return "Kastenmöbel-Sets"
            if any(token in text for token in ("desk", "schreibtisch", "office", "empfang")):
                return "Arbeitsmöbel-Sets"

    return OTTO_FALLBACK_CATEGORY


def as_number(value: Any) -> float | None:
    if not is_meaningful(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(" ", "").replace(",", ".")
    match = NUMBER_PATTERN.search(text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def as_int(value: Any) -> int | None:
    number = as_number(value)
    if number is None:
        return None
    return int(round(number))


def as_positive_number(value: Any) -> float | None:
    number = as_number(value)
    if number is None or number <= 0:
        return None
    return number


def normalize_iso_date(value: Any) -> str | None:
    text = as_text(value)
    if not text:
        return None
    if ISO_DATETIME_Z_PATTERN.match(text):
        return text
    if ISO_DATE_PATTERN.match(text):
        return f"{text}T00:00:00Z"
    return text


def split_media_urls(value: Any) -> list[str]:
    if not is_meaningful(value):
        return []
    if isinstance(value, list):
        raw_values = [str(v).strip() for v in value if is_meaningful(v)]
    else:
        raw_values = [v.strip() for v in MEDIA_SPLIT_PATTERN.split(str(value)) if v.strip()]
    urls = [u for u in raw_values if u.startswith(("http://", "https://"))]
    return list(dict.fromkeys(urls))


def normalize_currency(value: Any) -> str:
    text = as_text(value)
    if not text:
        return "EUR"

    raw = text.strip().upper()
    known = {
        "7": "EUR",
        "EUR": "EUR",
        "USD": "USD",
        "GBP": "GBP",
        "PLN": "PLN",
        "TRY": "TRY",
        "CHF": "CHF",
    }
    if raw in known:
        return known[raw]
    if re.match(r"^[A-Z]{3}$", raw):
        return raw
    return "EUR"


def dedupe_texts(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(value.strip())
    return out


def split_scalar_values(value: str) -> list[str]:
    text = value.strip()
    if not text:
        return []
    parts = SCALAR_SPLIT_PATTERN.split(text)
    if len(parts) == 1:
        return [text]
    return [part.strip() for part in parts if part.strip()]


def to_text_values(value: Any, *, max_len: int = 160) -> list[str]:
    if not is_meaningful(value):
        return []
    raw_values: list[str] = []
    if isinstance(value, list):
        for item in value:
            text = as_text(item)
            if text:
                raw_values.extend(split_scalar_values(text))
    else:
        text = as_text(value)
        if text:
            raw_values.extend(split_scalar_values(text))
    cleaned = [sanitize_value(v, max_len=max_len) for v in raw_values if v.strip()]
    return dedupe_texts(cleaned)


def collect_alias_values(lookup: dict[str, Any], aliases: list[str]) -> list[str]:
    values: list[str] = []
    seen_keys: set[str] = set()
    for alias in aliases:
        n_alias = normalize_key(alias)
        if not n_alias:
            continue
        for key, raw_value in lookup.items():
            if key in seen_keys:
                continue
            is_exact = key == n_alias
            is_suffixed_variant = key.startswith(n_alias) and key[len(n_alias) :].isdigit()
            if not (is_exact or is_suffixed_variant):
                continue
            values.extend(to_text_values(raw_value))
            seen_keys.add(key)
    return dedupe_texts(values)


def extract_dimension_values(lookup: dict[str, Any], aliases: list[str]) -> list[str]:
    raw_values = collect_alias_values(lookup, aliases)
    out: list[str] = []
    for raw in raw_values:
        number = as_number(raw)
        if number is None:
            out.append(raw)
            continue
        if abs(number - round(number)) < 1e-9:
            out.append(str(int(round(number))))
        else:
            out.append(f"{number:.2f}".rstrip("0").rstrip("."))
    return dedupe_texts(out)


def detect_part_count(lookup: dict[str, Any]) -> int:
    for alias in PART_COUNT_ALIASES:
        number = as_int(pick_value(lookup, [alias]))
        if number is not None and number > 0:
            return number

    set_includes = pick_value(lookup, SET_INCLUDES_ALIASES)
    if isinstance(set_includes, list):
        meaningful = [entry for entry in set_includes if is_meaningful(entry)]
        if meaningful:
            return len(meaningful)

    titles = [
        as_text(pick_value(lookup, ["Artikelbeschreibung", "Title", "Titel"])),
        as_text(pick_value(lookup, ["TranslatedDescription"])),
        as_text(pick_value(lookup, ["Produktart"])),
    ]
    for title in titles:
        if not title:
            continue
        match = PART_COUNT_PATTERN.search(title)
        if match:
            return int(match.group(1))
    return 1


def natural_join(values: list[str]) -> str:
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} und {values[1]}"
    return ", ".join(values[:-1]) + f" und {values[-1]}"


def build_style_phrase(style_value: str | None) -> str | None:
    if not style_value:
        return None

    token_map = {
        "modern": "modernen",
        "zeitgenossisch": "zeitgenössischen",
        "zeitgenoessisch": "zeitgenössischen",
        "klassisch": "klassischen",
        "skandinavisch": "skandinavischen",
        "minimalistisch": "minimalistischen",
        "industrial": "industriellen",
    }
    raw_tokens = [t.strip() for t in re.split(r"[|,;/]", style_value) if t.strip()]
    normalized_tokens: list[str] = []
    for token in raw_tokens:
        key = token.lower().replace("ö", "oe").replace("ä", "ae").replace("ü", "ue")
        mapped = token_map.get(key)
        if mapped:
            normalized_tokens.append(mapped)
        elif token:
            normalized_tokens.append(token.lower())

    normalized_tokens = dedupe_texts(normalized_tokens)
    if not normalized_tokens:
        return None
    return f"im {natural_join(normalized_tokens)} Stil"


def build_leading_style_adjective(product_name: str, style_value: str | None) -> str | None:
    if not style_value:
        return None
    product_key = product_name.lower()
    style_key = style_value.lower().replace("ö", "oe").replace("ä", "ae").replace("ü", "ue")

    if "tisch" in product_key and "modern" in style_key:
        return "Moderner"
    if "tisch" in product_key and "klassisch" in style_key:
        return "Klassischer"
    return None


def clean_feature_text(feature: str) -> str:
    return re.sub(r"^[A-Za-z]+\d*\s*:\s*", "", feature).strip()


def build_product_line_details(
    *,
    product_name: str,
    colors: list[str],
    materials: list[str],
    features: list[str],
) -> list[str]:
    details: list[str] = []
    product_key = product_name.lower()

    if "tisch" in product_key and colors:
        color = colors[0].lower()
        table_color_map = {
            "schwarz": "schwarzer",
            "weiss": "weisser",
            "weiß": "weisser",
            "grau": "grauer",
            "braun": "brauner",
            "beige": "beiger",
        }
        color_adj = table_color_map.get(color)
        if color_adj:
            details.append(f"{color_adj} Platte")
        else:
            details.append(f"Platte in {colors[0]}")
    elif colors:
        details.append(f"Farbe {colors[0]}")

    if materials:
        material = materials[0]
        if "tisch" in product_key and "glas" not in product_key and "glas" in material.lower():
            details.append("Glaselementen")
        elif "aus " not in material.lower():
            details.append(f"Material aus {material}")
        else:
            details.append(material)

    if features:
        for feature in features:
            cleaned = clean_feature_text(feature)
            if not cleaned:
                continue
            lower_cleaned = cleaned.lower()
            if "ablage" in lower_cleaned and "ablage" not in " ".join(details).lower():
                details.append("Ablagefläche")
                continue
            details.append(cleaned)
            if len(details) >= 3:
                break

    return dedupe_texts(details)


def build_product_line(lookup: dict[str, Any]) -> str | None:
    name = as_text(pick_value(lookup, NAME_ALIASES)) or as_text(
        pick_value(lookup, TITLE_ALIASES)
    )
    if not name:
        return None

    product_name = " ".join(name.split()[:6]).strip(" -|,")
    if not product_name:
        return None

    styles = collect_alias_values(lookup, STYLE_ALIASES)
    style_value = styles[0] if styles else None
    leading_style_adj = build_leading_style_adjective(product_name, style_value)
    style_phrase = build_style_phrase(style_value)
    colors = collect_alias_values(lookup, COLOR_ALIASES)
    materials = collect_alias_values(lookup, MATERIAL_ALIASES)
    features = collect_alias_values(lookup, FEATURE_ALIASES)
    details = build_product_line_details(
        product_name=product_name,
        colors=colors,
        materials=materials,
        features=features,
    )

    if leading_style_adj:
        line = f"{leading_style_adj} {product_name}"
    elif style_phrase:
        line = f"{product_name} {style_phrase}"
    else:
        line = product_name

    if details:
        line = f"{line} mit {natural_join(details[:2])}"

    line = re.sub(r"\s+", " ", line).strip(" ,.;|-")
    if not line:
        return None
    return sanitize_value(line, max_len=120)


def build_default_compliance() -> dict[str, Any]:
    return {
        "productSafety": {
            "addresses": [
                {
                    "name": "AEA GmbH & Co. KG",
                    "address": "Am Flugplatz 28, 88483 Burgrieden, Deutschland",
                    "regionCode": "DE",
                    "email": "info@jvmoebel.de",
                    "url": "https://www.jvmoebel.de/Infos/Kontakt.htm",
                    "phone": "07392 - 93 78 44 0",
                    "roles": ["DISTRIBUTOR"],
                    "components": [],
                }
            ]
        }
    }


def prune_empty(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, val in value.items():
            pruned = prune_empty(val)
            if pruned is None:
                continue
            if pruned == "":
                continue
            if pruned == [] and key != "components":
                continue
            if pruned == {} and key != "maxOrderQuantity":
                continue
            cleaned[key] = pruned
        return cleaned
    if isinstance(value, list):
        cleaned_list = [prune_empty(v) for v in value]
        return [v for v in cleaned_list if v not in (None, "", [], {})]
    return value


def build_dimension_bullet(lookup: dict[str, Any]) -> str | None:
    dims: list[str] = []
    for label, aliases in DIMENSION_BULLET_FIELDS:
        text = as_text(pick_value(lookup, aliases))
        if text:
            dims.append(f"{label}: {text}")
    if not dims:
        return None
    return "Masse: " + " | ".join(dims)


def build_bullets(lookup: dict[str, Any]) -> list[str]:
    pairs = [
        ("Produktart", pick_value(lookup, ["Produktart", "type"])),
        ("Marke", pick_value(lookup, ["Marke", "Brand", "manufacturer"])),
        ("Material", pick_value(lookup, MATERIAL_ALIASES)),
        ("Farbe", pick_value(lookup, COLOR_ALIASES)),
    ]
    bullets: list[str] = []
    for label, value in pairs:
        text = as_text(value)
        if text:
            bullets.append(f"{label}: {text}")

    dimension_bullet = build_dimension_bullet(lookup)
    if dimension_bullet:
        bullets.append(dimension_bullet)
    return bullets[:5]


def format_attribute_values(name: str, values: list[str]) -> list[str]:
    if len(values) <= 1:
        return values
    label = ATTRIBUTE_LABEL_MAP.get(name, normalize_key(name) or "value")
    return [f"{label}{idx}: {value}" for idx, value in enumerate(values, start=1)]


def build_attributes(lookup: dict[str, Any], part_count: int) -> list[dict[str, Any]]:
    attributes: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for name, aliases in ATTRIBUTE_CANDIDATES:
        if name in DIMENSION_ATTRIBUTE_NAMES:
            values = extract_dimension_values(lookup, aliases)
        else:
            values = collect_alias_values(lookup, aliases)

        if name == "Anzahl Teile" and not values and part_count > 0:
            values = [str(part_count)]

        if name == "Grundfarbe" and not values:
            values = collect_alias_values(lookup, COLOR_ALIASES)

        if name == "Hinweis Massangaben" and not values:
            has_dimensions = any(
                as_text(pick_value(lookup, aliases))
                for aliases in [WIDTH_ALIASES, HEIGHT_ALIASES, DEPTH_ALIASES, LENGTH_ALIASES]
            )
            if has_dimensions:
                values = ["Alle Angaben sind ca.-Masse."]

        if not values or name in seen_names:
            continue

        seen_names.add(name)
        attributes.append(
            {
                "name": name,
                "values": format_attribute_values(name, values),
                "additional": False,
            }
        )
    return attributes


def build_media_assets(lookup: dict[str, Any]) -> list[dict[str, str]]:
    media_sources: list[str] = []
    media_sources.extend(split_media_urls(pick_value(lookup, ["PictureURL", "pictureurls"])))
    media_sources.extend(split_media_urls(pick_value(lookup, ["GalleryURL"])))
    deduped = list(dict.fromkeys(media_sources))
    return [{"type": "IMAGE", "location": url} for url in deduped]


def build_packing_unit(lookup: dict[str, Any]) -> dict[str, int]:
    width = as_int(pick_value(lookup, WIDTH_ALIASES))
    height = as_int(pick_value(lookup, HEIGHT_ALIASES))
    length = as_int(pick_value(lookup, LENGTH_ALIASES + DEPTH_ALIASES))
    weight = as_int(pick_value(lookup, ["Gewicht", "Weight"]))
    return {
        "weight": weight if weight is not None else 0,
        "width": width if width is not None else 0,
        "height": height if height is not None else 0,
        "length": length if length is not None else 0,
    }


def build_pricing(lookup: dict[str, Any], currency: str) -> dict[str, Any]:
    pricing: dict[str, Any] = {
        "vat": "FULL",
        "normPriceInfo": {
            "normAmount": as_number(pick_value(lookup, ["AuffuellMindestMenge"])),
            "normUnit": as_text(pick_value(lookup, ["AuffuellMindestEinheit", "NormUnit"])),
            "salesAmount": as_number(pick_value(lookup, ["AuffuellMenge"])),
            "salesUnit": as_text(pick_value(lookup, ["AuffuellEinheit", "SalesUnit"])),
        },
    }

    standard_amount = as_positive_number(
        pick_value(lookup, ["SofortkaufenPreis", "Startpreis", "Price", "StammPrice"])
    )
    msrp_amount = as_positive_number(pick_value(lookup, ["StammPrice", "MSRP"]))
    sale_amount = as_positive_number(pick_value(lookup, ["DiscountPriceAmount"]))

    if standard_amount is not None:
        pricing["standardPrice"] = {"amount": standard_amount, "currency": currency}
    if msrp_amount is not None:
        pricing["msrp"] = {"amount": msrp_amount, "currency": currency}
    if sale_amount is not None:
        pricing["sale"] = {"salePrice": {"amount": sale_amount, "currency": currency}}
    return pricing


def build_normalized_product(item: dict[str, Any], seo_html: str) -> dict[str, Any]:
    lookup = build_lookup(item)
    part_count = detect_part_count(lookup)
    is_multi_item = part_count > 1

    ean = as_text(pick_value(lookup, ["EAN", "GTIN"]))
    sku = ean
    product_reference = sku
    currency = normalize_currency(pick_value(lookup, ["Currency"]))

    normalized = {
        "productReference": product_reference,
        "sku": sku,
        "ean": ean,
        "pzn": as_text(pick_value(lookup, ["PZN"])),
        "mpn": as_text(pick_value(lookup, ["MPN", "Herstellernummer", "ManufacturerPartNumber"])),
        "moin": as_text(pick_value(lookup, ["MOIN"])),
        "releaseDate": normalize_iso_date(
            pick_value(lookup, ["releaseDate", "ReleaseDate", "Erscheinungsdatum"])
        ),
        "productDescription": {
            "category": map_to_otto_category(lookup),
            "brandId": "UO4EGHSX",
            "productLine": build_product_line(lookup),
            "productionDate": normalize_iso_date(
                pick_value(lookup, ["ProductionDate", "Herstellungsdatum"])
            ),
            "multiPack": is_multi_item,
            "bundle": is_multi_item,
            "fscCertified": False,
            "disposal": False,
            "productUrl": as_text(pick_value(lookup, ["ProductUrl", "URL"])),
            "description": seo_html,
            "bulletPoints": build_bullets(lookup),
            "attributes": build_attributes(lookup, part_count),
        },
        "mediaAssets": build_media_assets(lookup),
        "order": {"maxOrderQuantity": {}},
        "pricing": build_pricing(lookup, currency),
        "compliance": build_default_compliance(),
        "logistics": {
            "packingUnitCount": part_count if part_count > 0 else 1,
            "packingUnits": [build_packing_unit(lookup)],
        },
    }
    return prune_empty(normalized)


def should_skip_input_file(path: Path, config: NormalizeConfig) -> bool:
    name_lower = path.name.lower()
    if path.name.startswith("_"):
        return True
    if name_lower == "d.json":
        return True
    if config.skip_normalized_files and path.stem.endswith(config.output_suffix):
        return True
    return False


def iter_input_files(config: NormalizeConfig) -> list[Path]:
    if config.input_path:
        explicit = Path(config.input_path)
        if not explicit.exists():
            print(f"Input file does not exist: {explicit}", file=sys.stderr)
            raise SystemExit(2)
        if explicit.suffix.lower() != ".json":
            print(f"Input file must be .json: {explicit}", file=sys.stderr)
            raise SystemExit(2)
        return [explicit]

    files = sorted(Path(".").glob(config.input_glob))
    return [
        path
        for path in files
        if path.is_file() and path.suffix.lower() == ".json" and not should_skip_input_file(path, config)
    ]


def load_input_items(input_file: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with input_file.open("rb") as stream:
        for product in ijson.items(stream, "item"):
            if isinstance(product, dict):
                items.append(product)
    if items:
        return items

    loaded = read_json(input_file)
    if isinstance(loaded, dict):
        return [loaded]
    if isinstance(loaded, list):
        return [item for item in loaded if isinstance(item, dict)]
    return []


def normalize_items(items: list[dict[str, Any]], max_chars: int) -> tuple[list[dict[str, Any]], int]:
    normalized: list[dict[str, Any]] = []
    skipped_items = 0
    for item in items:
        try:
            seo_html = build_seo_description(item, max_chars=max_chars)
            normalized.append(build_normalized_product(item=item, seo_html=seo_html))
        except Exception:
            skipped_items += 1
    return normalized, skipped_items


def output_path_for_input(input_file: Path, config: NormalizeConfig) -> Path:
    return input_file.with_name(f"{input_file.stem}{config.output_suffix}.json")


def process_file(input_file: Path, config: NormalizeConfig) -> tuple[Path, int, int]:
    items = load_input_items(input_file)
    normalized_items, skipped_items = normalize_items(items, max_chars=config.max_chars)
    output_file = output_path_for_input(input_file, config)
    rendered = json.dumps(normalized_items, ensure_ascii=False, indent=2)
    output_file.write_text(rendered + "\n", encoding="utf-8")
    return output_file, len(normalized_items), skipped_items


def main() -> None:
    config = NormalizeConfig()
    input_files = iter_input_files(config)
    if not input_files:
        print("No input JSON files found to process.")
        return

    processed_files = 0
    failed_files = 0
    total_products = 0
    total_skipped_products = 0

    for input_file in input_files:
        try:
            output_file, written_count, skipped_count = process_file(input_file, config)
            processed_files += 1
            total_products += written_count
            total_skipped_products += skipped_count
            print(f"{input_file.name} -> {output_file.name} | products: {written_count}, skipped: {skipped_count}")
        except Exception as exc:
            failed_files += 1
            print(f"FAILED {input_file.name}: {exc}", file=sys.stderr)

    summary = (
        f"Done. files_ok={processed_files}, files_failed={failed_files}, "
        f"products_written={total_products}, products_skipped={total_skipped_products}"
    )
    print(summary)


if __name__ == "__main__":
    main()
