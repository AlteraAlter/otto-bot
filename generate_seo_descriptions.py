#!/usr/bin/env python3
"""
Generate HTML SEO descriptions for product JSON files.

The script is designed for mixed product catalogs where fields vary by item.
It builds a concise, structured description and guarantees output length is
strictly below a configurable character limit (default: 2000).
"""

from __future__ import annotations

import argparse
import glob
import html
import json
import re
from pathlib import Path
from typing import Any

PLACEHOLDER_DESCRIPTIONS = {
    "",
    "<-stammbeschreibung->",
    "<stammbeschreibung>",
    "stammbeschreibung",
    "-",
}


SYSTEM_KEY_PREFIXES = (
    "pay_",
    "ship_",
    "hazard",
    "safety",
    "gallery",
    "reserve",
    "secoffer",
    "discount",
    "auffuell",
    "usedomestic",
    "useinternational",
)


SYSTEM_KEYS = {
    "currency",
    "startpreis",
    "typ",
    "menge",
    "sofortkaufenpreis",
    "categoryid",
    "category2id",
    "adult",
    "bindingauction",
    "boldtitle",
    "checkoutenabled",
    "featured",
    "highlight",
    "private",
    "location",
    "mindestgebot",
    "photocount",
    "photodisplaytype",
    "region",
    "shippingoption",
    "titlebarimage",
    "uuid",
    "zip",
    "checkoutdetailsspecified",
    "counter",
    "dauer",
    "shopkat",
    "kollektion",
    "treuhand",
    "subtitletext",
    "i_stammartikel",
    "siteid",
    "quickcheckout",
    "vorlagekopf",
    "vorlagefuss",
    "country",
    "vatpercent",
    "shiptolocations",
    "nowandnew",
    "subaccount",
    "lotsize",
    "shopcat2",
    "itemborder",
    "ebestoffer",
    "stammprice",
    "pricestc",
    "ebayexpress",
    "transfercurr",
    "getitfast",
    "widerrufdauer",
    "dispatchtimemax",
    "supremegallery",
    "ebestofferminimum",
    "shippingtermsindescription",
    "propackplusbundle",
    "mengenredutkion",
    "listavailable",
    "quantityrelationshiptype",
    "paymentprofileid",
    "returnpolicyprofileid",
    "shippingprofileid",
    "pictureurls",
    "motorsgermanysearchable",
    "sprachcode",
    "businessseller",
    "restrictedtobusiness",
    "galleryduration",
    "variationtype",
    "varavailabilitytype",
    "useshippingdiscount",
    "useshippingdiscountinternational",
    "noexcludeshipping",
    "useproductfield",
    "includeprefilledinfo",
    "packstationverbieten",
    "shippingdiscountprofileid",
    "internationalshippingdiscountprofileid",
    "iphonebanner",
    "partsfitmentproductoption",
    "usetopoffer",
    "priceadditionruleid",
    "ebayplus",
    "conditiondescription",
    "useproductweight",
    "usemanufacturerinformation",
    "manufacturerinformationlabel",
    "conditionid",
    "disableusecrossgallery",
    "crosssellinggallery",
    "ebayproductid",
    "repairscore",
    "translateddescription",
    "description",
    "artikelbeschreibung",
    "galleryurl",
    "pictureurl",
    "id",
    "fabric",
}


FIELD_ALIASES = {
    "Produktart": ["produktart", "produkttyp", "itemtype", "type"],
    "Marke": ["marke", "brand", "hersteller", "manufacturer"],
    "Material": ["material", "gestellmaterial", "polsterstoff", "holzton"],
    "Farbe": ["farbe", "color"],
    "Zimmer": ["zimmer", "room"],
    "Stil": ["stil", "style"],
    "Form": ["form", "shape"],
    "Montage": ["montage"],
    "Montage erforderlich": ["montageerforderlich", "assemblyrequired"],
    "Montagezustand": ["montagezustand", "assemblystatus"],
    "Besonderheiten": ["besonderheiten", "features"],
    "Muster": ["muster", "pattern"],
    "Herstellergarantie": ["herstellergarantie", "warranty"],
    "Anzahl der Teile": ["anzahlderteile"],
    "Anzahl der Tueren": ["anzahldertueren", "anzahlderturen"],
    "Anzahl der Schubladen": ["anzahlderschubladen"],
    "Anzahl der Sitzplaetze": ["anzahldersitzplatze", "anzahldersitzplaetze"],
    "Personalisierung": ["personalisieren", "personalisiert"],
    "Lampenfassung": ["lampenfassung"],
    "Anzahl der Lichter": ["anzahlderlichter"],
    "Spannung": ["spannung", "voltage"],
    "Nennstrom": ["nennstrom"],
    "Pflegeanleitung": ["pflegeanleitung"],
}


DIMENSION_ALIASES = {
    "Breite": ["breite", "width"],
    "Hoehe": ["hohe", "hoehe", "height"],
    "Laenge": ["lange", "laenge", "length"],
    "Tiefe": ["tiefe", "depth"],
    "Sitzhoehe": ["sitzhohe", "sitzhoehe", "seatheight"],
    "Sitztiefe": ["sitztiefe", "seatdepth"],
    "Sitzbreite": ["sitzbreite", "seatwidth"],
}


TITLE_KEYS = [
    "Artikelbeschreibung",
    "Title",
    "Titel",
    "Produktname",
    "Name",
    "Produktart",
]


PRODUCT_TYPE_PATTERNS = {
    "Bett": ["bett", "bed", "boxspring", "matratz", "schlaf"],
    "Sofa": ["sofa", "couch", "chester", "sessel", "divan", "koltuk"],
    "Tisch": ["tisch", "table", "esstisch", "couchtisch"],
    "Stuhl": ["stuhl", "chair", "hocker", "sandalye"],
    "Schrank": [
        "schrank",
        "vitrine",
        "kommode",
        "sideboard",
        "regal",
        "anrichte",
        "cabinet",
    ],
    "Leuchte": ["lampe", "leuchte", "light", "luster", "chandelier"],
    "Outdoor-Moebel": ["garten", "outdoor", "terrasse", "balkon"],
}


def normalize_key(value: str) -> str:
    value = value.lower()
    value = (
        value.replace("ae", "a")
        .replace("oe", "o")
        .replace("ue", "u")
        .replace("ß", "ss")
        .replace("ä", "a")
        .replace("ö", "o")
        .replace("ü", "u")
    )
    return re.sub(r"[^a-z0-9]+", "", value)


def normalize_text(value: str) -> str:
    value = value.lower()
    value = (
        value.replace("ae", "a")
        .replace("oe", "o")
        .replace("ue", "u")
        .replace("ß", "ss")
        .replace("ä", "a")
        .replace("ö", "o")
        .replace("ü", "u")
    )
    return value


def is_meaningful(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        compact = re.sub(r"\s+", " ", value).strip()
        return compact.lower() not in PLACEHOLDER_DESCRIPTIONS
    if isinstance(value, list):
        return any(is_meaningful(v) for v in value)
    if isinstance(value, dict):
        return any(is_meaningful(v) for v in value.values())
    return True


def compact_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def sanitize_value(value: Any, max_len: int = 140) -> str:
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            as_text = compact_ws(str(item))
            if as_text and as_text not in parts:
                parts.append(as_text)
            if len(parts) >= 5:
                break
        out = ", ".join(parts)
    elif isinstance(value, bool):
        out = "Ja" if value else "Nein"
    else:
        out = compact_ws(str(value))

    if len(out) > max_len:
        out = out[: max_len - 3].rstrip() + "..."
    return out


def escape_html(value: str) -> str:
    return html.escape(value, quote=True)


def first_non_empty(item: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        if key in item and is_meaningful(item[key]):
            return sanitize_value(item[key], max_len=180)
    return ""


def build_normalized_map(item: dict[str, Any]) -> dict[str, tuple[str, Any]]:
    norm_map: dict[str, tuple[str, Any]] = {}
    for key, value in item.items():
        if not is_meaningful(value):
            continue
        nk = normalize_key(key)
        if nk and nk not in norm_map:
            norm_map[nk] = (key, value)
    return norm_map


def find_alias_field(
    norm_map: dict[str, tuple[str, Any]],
    aliases: list[str],
) -> tuple[str | None, Any]:
    for alias in aliases:
        n_alias = normalize_key(alias)
        if n_alias in norm_map:
            return norm_map[n_alias]
    return None, None


def detect_product_label(title: str, product_type: str) -> str:
    text = normalize_text(f"{title} {product_type}")
    for label, patterns in PRODUCT_TYPE_PATTERNS.items():
        for pattern in patterns:
            if pattern in text:
                return label
    if product_type:
        return product_type
    return "Moebelstueck"


def collect_dimensions(norm_map: dict[str, tuple[str, Any]]) -> str:
    chunks: list[str] = []
    used: set[str] = set()

    for label, aliases in DIMENSION_ALIASES.items():
        key, value = find_alias_field(norm_map, aliases)
        if key and key not in used:
            cleaned = sanitize_value(value, max_len=64)
            if cleaned:
                chunks.append(f"{label}: {cleaned}")
                used.add(key)

    for key, value in norm_map.values():
        nk = normalize_key(key)
        if key in used:
            continue
        if "mass" in nk or "mae" in nk:
            cleaned = sanitize_value(value, max_len=90)
            if cleaned:
                chunks.append(f"{key}: {cleaned}")
                used.add(key)
        if len(chunks) >= 4:
            break

    return " | ".join(chunks)


def collect_feature_bullets(item: dict[str, Any], max_items: int) -> list[str]:
    norm_map = build_normalized_map(item)
    bullets: list[str] = []
    used_keys: set[str] = set()

    for label, aliases in FIELD_ALIASES.items():
        source_key, raw_value = find_alias_field(norm_map, aliases)
        if not source_key or source_key in used_keys:
            continue
        value = sanitize_value(raw_value)
        if value:
            bullets.append(
                f"<li><strong>{escape_html(label)}:</strong> {escape_html(value)}</li>"
            )
            used_keys.add(source_key)
        if len(bullets) >= max_items:
            return bullets

    dims = collect_dimensions(norm_map)
    if dims and len(bullets) < max_items:
        bullets.append(f"<li><strong>Masse:</strong> {escape_html(dims)}</li>")

    if len(bullets) >= max_items:
        return bullets

    extra_patterns = (
        "anzahl",
        "pflege",
        "garantie",
        "lampen",
        "spannung",
        "strom",
        "personalis",
    )
    for key, value in item.items():
        if len(bullets) >= max_items:
            break
        if not is_meaningful(value):
            continue
        nk = normalize_key(key)
        if nk in SYSTEM_KEYS or any(
            nk.startswith(prefix) for prefix in SYSTEM_KEY_PREFIXES
        ):
            continue
        if key in used_keys:
            continue
        if not any(pattern in nk for pattern in extra_patterns):
            continue
        cleaned = sanitize_value(value)
        bullets.append(
            f"<li><strong>{escape_html(key)}:</strong> {escape_html(cleaned)}</li>"
        )
        used_keys.add(key)

    return bullets[:max_items]


def build_intro(
    product_label: str,
    product_type: str,
    brand: str,
    material: str,
    color: str,
    style: str,
    room: str,
) -> str:
    chunks: list[str] = []

    subject = product_type or product_label
    chunks.append(f"Dieses {subject}")
    if brand:
        chunks.append(f"von {brand}")
    if style:
        chunks.append(f"im Stil {style}")

    details: list[str] = []
    if material:
        details.append(f"Material {material}")
    if color:
        details.append(f"Farbton {color}")

    text = " ".join(chunks)
    if details:
        text += " kombiniert " + ", ".join(details)
    text += "."

    if room:
        text += f" Geeignet fuer {room}."
    else:
        text += " Ideal fuer stilvolle Wohnkonzepte."

    return text


def dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if not value:
            continue
        marker = value.lower()
        if marker in seen:
            continue
        seen.add(marker)
        out.append(value)
    return out


def build_seo_description(
    item: dict[str, Any],
    max_chars: int,
) -> str:
    title = first_non_empty(item, TITLE_KEYS)
    norm_map = build_normalized_map(item)

    product_type = first_non_empty(item, ["Produktart"]) or (
        sanitize_value(find_alias_field(norm_map, FIELD_ALIASES["Produktart"])[1])
        if find_alias_field(norm_map, FIELD_ALIASES["Produktart"])[1] is not None
        else ""
    )
    brand = (
        sanitize_value(find_alias_field(norm_map, FIELD_ALIASES["Marke"])[1])
        if find_alias_field(norm_map, FIELD_ALIASES["Marke"])[1] is not None
        else ""
    )
    material = (
        sanitize_value(find_alias_field(norm_map, FIELD_ALIASES["Material"])[1])
        if find_alias_field(norm_map, FIELD_ALIASES["Material"])[1] is not None
        else ""
    )
    color = (
        sanitize_value(find_alias_field(norm_map, FIELD_ALIASES["Farbe"])[1])
        if find_alias_field(norm_map, FIELD_ALIASES["Farbe"])[1] is not None
        else ""
    )
    room = (
        sanitize_value(find_alias_field(norm_map, FIELD_ALIASES["Zimmer"])[1])
        if find_alias_field(norm_map, FIELD_ALIASES["Zimmer"])[1] is not None
        else ""
    )
    style = (
        sanitize_value(find_alias_field(norm_map, FIELD_ALIASES["Stil"])[1])
        if find_alias_field(norm_map, FIELD_ALIASES["Stil"])[1] is not None
        else ""
    )

    product_label = detect_product_label(title, product_type)

    seo_title = title if title else f"{product_label} fuer moderne Wohnraeume"
    seo_title = sanitize_value(seo_title, max_len=170)
    intro = build_intro(
        product_label=product_label,
        product_type=product_type or product_label,
        brand=brand,
        material=material,
        color=color,
        style=style,
        room=room,
    )

    keyword_parts = dedupe_keep_order(
        [product_type, product_label, brand, material, color, style]
    )
    keyword_line = ""
    if keyword_parts:
        keyword_line = "Relevante Suchbegriffe: " + ", ".join(keyword_parts[:8]) + "."

    closing = (
        "Eine starke Wahl fuer alle, die Qualitaet, Design und Alltagstauglichkeit"
        " in einem Produkt suchen."
    )

    build_options = [
        {"bullets": 10, "with_keywords": True, "with_closing": True},
        {"bullets": 8, "with_keywords": True, "with_closing": False},
        {"bullets": 6, "with_keywords": False, "with_closing": False},
        {"bullets": 4, "with_keywords": False, "with_closing": False},
    ]

    for option in build_options:
        bullets = collect_feature_bullets(item, max_items=option["bullets"])
        parts = [
            f"<p><strong>{escape_html(seo_title)}</strong></p>",
            f"<p>{escape_html(intro)}</p>",
        ]
        if bullets:
            parts.append("<ul>" + "".join(bullets) + "</ul>")
        if option["with_keywords"] and keyword_line:
            parts.append(f"<p>{escape_html(keyword_line)}</p>")
        if option["with_closing"]:
            parts.append(f"<p>{escape_html(closing)}</p>")

        candidate = "".join(parts)
        if len(candidate) < max_chars:
            return candidate

    minimal_intro = sanitize_value(intro, max_len=260)
    fallback = (
        f"<p><strong>{escape_html(seo_title)}</strong></p>"
        f"<p>{escape_html(minimal_intro)}</p>"
    )
    if len(fallback) < max_chars:
        return fallback

    allowance = max(24, max_chars - 32)
    plain = sanitize_value(seo_title + " - " + minimal_intro, max_len=allowance)
    final_text = f"<p>{escape_html(plain)}</p>"
    if len(final_text) >= max_chars:
        hard_limit = max(8, max_chars - 8)
        clipped = escape_html(plain)[:hard_limit].rstrip() + "..."
        final_text = f"<p>{clipped}</p>"
    return final_text


def decode_with_fallback(raw: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), "utf-8"


def read_json(path: Path) -> tuple[Any, str]:
    text, encoding = decode_with_fallback(path.read_bytes())
    return json.loads(text), encoding


def write_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=4),
        encoding="utf-8",
        newline="\n",
    )


def write_text_lines(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def should_overwrite(current_value: Any, overwrite_existing: bool) -> bool:
    if overwrite_existing:
        return True
    if not is_meaningful(current_value):
        return True
    as_text = compact_ws(str(current_value)).lower()
    return as_text in PLACEHOLDER_DESCRIPTIONS


def process_file(
    path: Path,
    output_path: Path,
    target_field: str,
    max_chars: int,
    overwrite_existing: bool,
) -> tuple[int, int]:
    data, _encoding = read_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path} is not a JSON array.")

    updated = 0
    skipped = 0
    for item in data:
        if not isinstance(item, dict):
            skipped += 1
            continue

        if not should_overwrite(item.get(target_field), overwrite_existing):
            skipped += 1
            continue

        seo = build_seo_description(item, max_chars=max_chars)
        if len(seo) >= max_chars:
            seo = seo[: max_chars - 4].rstrip() + "..."
        item[target_field] = seo
        updated += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(output_path, data)
    return updated, skipped


def process_file_text(
    path: Path,
    output_path: Path,
    max_chars: int,
) -> tuple[int, int]:
    data, _encoding = read_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path} is not a JSON array.")

    lines: list[str] = []
    generated = 0
    skipped = 0

    for item in data:
        if not isinstance(item, dict):
            skipped += 1
            continue

        seo = build_seo_description(item, max_chars=max_chars)
        if len(seo) >= max_chars:
            seo = seo[: max_chars - 4].rstrip() + "..."
        seo = seo.replace("\r", " ").replace("\n", " ").strip()
        lines.append(seo)
        generated += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_text_lines(output_path, lines)
    return generated, skipped


def expand_input_paths(raw_inputs: list[str]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()

    for raw in raw_inputs:
        path = Path(raw)

        if path.exists() and path.is_file():
            resolved = path.resolve()
            if resolved not in seen and resolved.suffix.lower() == ".json":
                seen.add(resolved)
                files.append(resolved)
            continue

        if path.exists() and path.is_dir():
            for match in sorted(path.glob("*.json")):
                resolved = match.resolve()
                if resolved not in seen:
                    seen.add(resolved)
                    files.append(resolved)
            continue

        for matched in sorted(glob.glob(raw, recursive=True)):
            candidate = Path(matched)
            if candidate.is_file() and candidate.suffix.lower() == ".json":
                resolved = candidate.resolve()
                if resolved not in seen:
                    seen.add(resolved)
                    files.append(resolved)

    return files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate HTML SEO descriptions for product JSON arrays.",
    )
    parser.add_argument(
        "--input",
        nargs="+",
        required=True,
        help="Input JSON file(s), folder(s), or glob pattern(s).",
    )
    parser.add_argument(
        "--target-field",
        default="Description",
        help="Field to write SEO text into (default: Description).",
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=2000,
        help="Maximum allowed character length per description (strictly less than this value).",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite source files directly.",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Output directory when not using --in-place.",
    )
    parser.add_argument(
        "--suffix",
        default="_seo",
        help="Filename suffix when not using --in-place or --output-dir (default: _seo).",
    )
    parser.add_argument(
        "--overwrite-existing",
        action="store_true",
        help="Replace already filled descriptions too (default is only empty/placeholder).",
    )
    parser.add_argument(
        "--text-only",
        action="store_true",
        help="Write only generated description text lines to .txt output (no JSON output).",
    )
    parser.add_argument(
        "--text-output",
        default="",
        help="Output .txt file (single input) or output folder (multiple inputs) for --text-only mode.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.max_chars < 100:
        raise SystemExit("--max-chars must be at least 100.")

    inputs = expand_input_paths(args.input)
    if not inputs:
        raise SystemExit("No JSON files found for --input.")

    output_dir = Path(args.output_dir).resolve() if args.output_dir else None
    text_output = Path(args.text_output).resolve() if args.text_output else None

    total_files = 0
    total_updated = 0
    total_skipped = 0

    if args.text_only and args.in_place:
        raise SystemExit("--in-place cannot be used with --text-only.")
    if args.text_only and text_output and len(inputs) > 1 and text_output.suffix:
        raise SystemExit(
            "--text-output must be a directory when using multiple input files in --text-only mode."
        )

    for src in inputs:
        if args.text_only:
            if text_output and text_output.suffix and len(inputs) == 1:
                dst = text_output
            elif text_output:
                dst = text_output / f"{src.stem}_descriptions.txt"
            elif output_dir:
                dst = output_dir / f"{src.stem}_descriptions.txt"
            else:
                dst = src.with_name(f"{src.stem}{args.suffix}_descriptions.txt")

            generated, skipped = process_file_text(
                path=src,
                output_path=dst,
                max_chars=args.max_chars,
            )
            total_files += 1
            total_updated += generated
            total_skipped += skipped
            print(
                f"[OK] {src.name} -> {dst.name} | descriptions: {generated}, skipped: {skipped}"
            )
        else:
            if args.in_place:
                dst = src
            elif output_dir:
                dst = output_dir / src.name
            else:
                dst = src.with_name(f"{src.stem}{args.suffix}{src.suffix}")

            updated, skipped = process_file(
                path=src,
                output_path=dst,
                target_field=args.target_field,
                max_chars=args.max_chars,
                overwrite_existing=args.overwrite_existing,
            )
            total_files += 1
            total_updated += updated
            total_skipped += skipped
            print(
                f"[OK] {src.name} -> {dst.name} | updated: {updated}, skipped: {skipped}"
            )

    print(
        f"Done. Files: {total_files}, records processed: {total_updated}, records skipped: {total_skipped}"
    )


if __name__ == "__main__":
    main()
