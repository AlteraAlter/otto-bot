import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models.attribute_allowed_values import AttributeAllowedValue  # noqa: F401
from app.models.attributes import Attribute
from app.models.categories import Category  # noqa: F401
from app.models.category_group import CategoryGroup  # noqa: F401
from app.services.translation_service import TranslationService


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_ru_translations")


async def main() -> None:
    async with SessionLocal() as session:
        translator = TranslationService(session)

        async def translate_or_none(value: str, *, context: str) -> str | None:
            try:
                return await translator.translate(
                    value,
                    source_lang="DE",
                    target_lang="RU",
                    context=context,
                )
            except Exception as exc:
                logger.warning("translation failed context=%s value=%s error=%s", context, value, exc)
                return None

        attributes = (
            await session.scalars(
                select(Attribute)
                .options(selectinload(Attribute.allowed_values))
                .order_by(Attribute.name.asc())
            )
        ).unique().all()
        for index, attribute in enumerate(attributes, start=1):
            changed = False
            if attribute.name and not attribute.name_ru:
                attribute.name_ru = await translate_or_none(
                    attribute.name,
                    context="otto_attribute",
                )
                changed = bool(attribute.name_ru)
            if attribute.description and not attribute.description_ru:
                attribute.description_ru = await translate_or_none(
                    attribute.description,
                    context="otto_requirement",
                )
                changed = changed or bool(attribute.description_ru)
            for allowed_value in attribute.allowed_values:
                if allowed_value.value and not allowed_value.value_ru:
                    allowed_value.value_ru = await translate_or_none(
                        allowed_value.value,
                        context="otto_attribute_value",
                    )
                    changed = changed or bool(allowed_value.value_ru)
            if changed:
                await session.commit()
            logger.info("attribute %s/%s %s", index, len(attributes), attribute.name)


if __name__ == "__main__":
    asyncio.run(main())
