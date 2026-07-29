import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models.attribute_allowed_values import AttributeAllowedValue
from app.models.attributes import Attribute
from app.models.categories import Category
from app.models.category_group import CategoryGroup
from app.services.translation_service import (
    TranslationService,
    normalize_translation_text,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_ru_translations")


Scope = str
SCOPES: tuple[Scope, ...] = ("groups", "categories", "attributes", "allowed-values")


@dataclass(frozen=True)
class TranslationItem:
    key: str
    text: str
    context: str


def canonical_key(value: str) -> str:
    return normalize_translation_text(value).casefold()


async def translate_items(
    translator: TranslationService,
    items: list[TranslationItem],
    *,
    limit: int | None,
    dry_run: bool,
) -> dict[str, str]:
    selected = items[:limit] if limit is not None else items
    translations: dict[str, str] = {}
    if dry_run:
        for index, item in enumerate(selected, start=1):
            logger.info(
                "dry-run translate %s/%s context=%s text=%s",
                index,
                len(selected),
                item.context,
                item.text,
            )
        return translations

    for start in range(0, len(selected), 50):
        batch = selected[start : start + 50]
        try:
            translated_batch = await translator.translate_many(
                [item.text for item in batch],
                source_lang="DE",
                target_lang="RU",
                context=batch[0].context,
            )
            translations.update(
                {
                    item.key: translated
                    for item, translated in zip(batch, translated_batch, strict=True)
                    if translated
                }
            )
            logger.info(
                "translated %s/%s context=%s batch=%s",
                min(start + len(batch), len(selected)),
                len(selected),
                batch[0].context,
                len(batch),
            )
        except Exception as exc:
            logger.warning(
                "translation batch failed context=%s start=%s size=%s error=%s",
                batch[0].context,
                start,
                len(batch),
                exc,
            )
    return translations


async def backfill_attribute_names(
    translator: TranslationService,
    *,
    limit: int | None,
    dry_run: bool,
) -> int:
    async with SessionLocal() as session:
        rows = (
            await session.scalars(select(Attribute).order_by(Attribute.name.asc()))
        ).all()
        ru_by_key = {
            canonical_key(row.name): normalize_translation_text(row.name_ru or "")
            for row in rows
            if normalize_translation_text(row.name_ru or "")
        }
        text_by_key = {
            canonical_key(row.name): normalize_translation_text(row.name)
            for row in rows
            if normalize_translation_text(row.name)
        }
        items = [
            TranslationItem(key, text, "otto_attribute")
            for key, text in text_by_key.items()
            if key not in ru_by_key
        ]
        logger.info(
            "attribute names: rows=%s unique=%s unique missing=%s",
            len(rows),
            len(text_by_key),
            len(items),
        )
        new_translations = await translate_items(
            translator,
            items,
            limit=limit,
            dry_run=dry_run,
        )
        translations = {**ru_by_key, **new_translations}
        if dry_run or not translations:
            return 0
        updated = 0
        for row in rows:
            translated = translations.get(canonical_key(row.name))
            if (
                translated
                and normalize_translation_text(row.name_ru or "") != translated
            ):
                row.name_ru = translated
                updated += 1
        await session.commit()
        return updated


async def backfill_category_groups(
    translator: TranslationService,
    *,
    limit: int | None,
    dry_run: bool,
) -> int:
    async with SessionLocal() as session:
        rows = (
            await session.scalars(
                select(CategoryGroup).order_by(CategoryGroup.name.asc())
            )
        ).all()
        existing_ru_by_key = {
            canonical_key(row.name): normalize_translation_text(row.name_ru or "")
            for row in rows
            if normalize_translation_text(row.name_ru or "")
        }
        items = [
            TranslationItem(
                canonical_key(row.name),
                normalize_translation_text(row.name),
                "otto_category_group",
            )
            for row in rows
            if row.name and canonical_key(row.name) not in existing_ru_by_key
        ]
        unique_items = list({item.key: item for item in items}.values())
        logger.info(
            "category groups: rows=%s unique=%s unique missing=%s",
            len(rows),
            len({canonical_key(row.name) for row in rows if row.name}),
            len(unique_items),
        )
        translations = await translate_items(
            translator, unique_items, limit=limit, dry_run=dry_run
        )
        if dry_run or not translations:
            return 0
        updated = 0
        for row in rows:
            translated = translations.get(canonical_key(row.name))
            if (
                translated
                and normalize_translation_text(row.name_ru or "") != translated
            ):
                row.name_ru = translated
                updated += 1
        await session.commit()
        return updated


async def backfill_categories(
    translator: TranslationService,
    *,
    limit: int | None,
    dry_run: bool,
) -> int:
    async with SessionLocal() as session:
        rows = (
            await session.scalars(select(Category).order_by(Category.name.asc()))
        ).all()
        ru_by_key: dict[str, str] = {}
        text_by_key: dict[str, str] = {}
        for row in rows:
            key = canonical_key(row.name)
            if not key:
                continue
            text_by_key.setdefault(key, normalize_translation_text(row.name))
            if normalize_translation_text(row.name_ru or ""):
                ru_by_key.setdefault(key, normalize_translation_text(row.name_ru or ""))

        items = [
            TranslationItem(key, text, "otto_category")
            for key, text in text_by_key.items()
            if key not in ru_by_key
        ]
        logger.info(
            "categories: rows=%s unique=%s unique missing=%s",
            len(rows),
            len(text_by_key),
            len(items),
        )
        translations = await translate_items(
            translator, items, limit=limit, dry_run=dry_run
        )
        translations = {**ru_by_key, **translations}
        if dry_run or not translations:
            return 0
        updated = 0
        for row in rows:
            translated = translations.get(canonical_key(row.name))
            if (
                translated
                and normalize_translation_text(row.name_ru or "") != translated
            ):
                row.name_ru = translated
                updated += 1
        await session.commit()
        return updated


async def backfill_attributes(
    translator: TranslationService,
    *,
    limit: int | None,
    dry_run: bool,
) -> int:
    async with SessionLocal() as session:
        rows = (
            await session.scalars(select(Attribute).order_by(Attribute.name.asc()))
        ).all()
        ru_by_key: dict[str, str] = {}
        text_by_key: dict[str, str] = {}
        description_ru_by_key: dict[str, str] = {}
        description_by_key: dict[str, str] = {}
        for row in rows:
            key = canonical_key(row.name)
            if not key:
                continue
            text_by_key.setdefault(key, normalize_translation_text(row.name))
            if normalize_translation_text(row.name_ru or ""):
                ru_by_key.setdefault(key, normalize_translation_text(row.name_ru or ""))
            if normalize_translation_text(row.description or ""):
                description_by_key.setdefault(
                    key, normalize_translation_text(row.description or "")
                )
            if normalize_translation_text(row.description_ru or ""):
                description_ru_by_key.setdefault(
                    key, normalize_translation_text(row.description_ru or "")
                )

        name_items = [
            TranslationItem(key, text, "otto_attribute")
            for key, text in text_by_key.items()
            if key not in ru_by_key
        ]
        description_items = [
            TranslationItem(key, text, "otto_requirement")
            for key, text in description_by_key.items()
            if key not in description_ru_by_key
        ]
        logger.info(
            "attributes: rows=%s unique=%s unique name missing=%s description missing=%s",
            len(rows),
            len(text_by_key),
            len(name_items),
            len(description_items),
        )
        name_translations = await translate_items(
            translator, name_items, limit=limit, dry_run=dry_run
        )
        remaining_limit = (
            None if limit is None else max(0, limit - len(name_translations))
        )
        description_translations = await translate_items(
            translator, description_items, limit=remaining_limit, dry_run=dry_run
        )
        name_translations = {**ru_by_key, **name_translations}
        description_translations = {**description_ru_by_key, **description_translations}
        if dry_run or (not name_translations and not description_translations):
            return 0
        updated = 0
        for row in rows:
            key = canonical_key(row.name)
            name_ru = name_translations.get(key)
            description_ru = description_translations.get(key)
            changed = False
            if name_ru and normalize_translation_text(row.name_ru or "") != name_ru:
                row.name_ru = name_ru
                changed = True
            if (
                description_ru
                and normalize_translation_text(row.description_ru or "")
                != description_ru
            ):
                row.description_ru = description_ru
                changed = True
            if changed:
                updated += 1
        await session.commit()
        return updated


async def backfill_allowed_values(
    translator: TranslationService,
    *,
    limit: int | None,
    dry_run: bool,
) -> int:
    async with SessionLocal() as session:
        rows = (
            await session.scalars(
                select(AttributeAllowedValue)
                .options(selectinload(AttributeAllowedValue.attribute))
                .order_by(AttributeAllowedValue.value.asc())
            )
        ).all()
        ru_by_key: dict[tuple[str, str], str] = {}
        text_by_key: dict[tuple[str, str], str] = {}
        for row in rows:
            attr_name = row.attribute.name if row.attribute else ""
            key = (canonical_key(attr_name), canonical_key(row.value))
            if not key[0] or not key[1]:
                continue
            text_by_key.setdefault(key, normalize_translation_text(row.value))
            if normalize_translation_text(row.value_ru or ""):
                ru_by_key.setdefault(
                    key, normalize_translation_text(row.value_ru or "")
                )

        items = [
            TranslationItem(f"{attr_key}\0{value_key}", text, "otto_attribute_value")
            for (attr_key, value_key), text in text_by_key.items()
            if (attr_key, value_key) not in ru_by_key
        ]
        logger.info(
            "allowed values: rows=%s unique=%s unique missing=%s",
            len(rows),
            len(text_by_key),
            len(items),
        )
        raw_translations = await translate_items(
            translator, items, limit=limit, dry_run=dry_run
        )
        translations = {
            tuple(key.split("\0", 1)): translated
            for key, translated in raw_translations.items()
        }
        translations = {**ru_by_key, **translations}
        if dry_run or not translations:
            return 0
        updated = 0
        for row in rows:
            attr_name = row.attribute.name if row.attribute else ""
            translated = translations.get(
                (canonical_key(attr_name), canonical_key(row.value))
            )
            if (
                translated
                and normalize_translation_text(row.value_ru or "") != translated
            ):
                row.value_ru = translated
                updated += 1
        await session.commit()
        return updated


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill Russian translations via DeepL using unique OTTO dictionary values."
    )
    parser.add_argument(
        "--scope", choices=[*SCOPES, "attribute-names", "all"], default="all"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Translate at most N unique items per scope run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log missing unique values without calling DeepL or writing DB.",
    )
    args = parser.parse_args()

    selected_scopes = SCOPES if args.scope == "all" else (args.scope,)
    handlers = {
        "groups": backfill_category_groups,
        "categories": backfill_categories,
        "attributes": backfill_attributes,
        "attribute-names": backfill_attribute_names,
        "allowed-values": backfill_allowed_values,
    }
    for scope in selected_scopes:
        async with SessionLocal() as session:
            translator = TranslationService(session)
            updated = await handlers[scope](
                translator,
                limit=args.limit,
                dry_run=args.dry_run,
            )
        logger.info("scope=%s updated_rows=%s", scope, updated)


if __name__ == "__main__":
    asyncio.run(main())
