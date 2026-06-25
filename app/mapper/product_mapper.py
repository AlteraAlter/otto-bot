import asyncio
import hashlib
import json
import logging
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from pydantic import BaseModel

from app.clients.otto_client import OttoClient
from app.core.configs import settings
from app.utils.attribute_generator import AttributeGenerator
from app.utils.bullet_point_generator import BulletPointGenerator
from app.utils.category_classifier import CategoryClassifier
from app.utils.description_generator import DescriptionGenerator
from app.utils.gpt_helper import GPTHelper

PRODUCT_AI_CONCURRENCY = 10

AI_SOURCE_SPECIFIC_KEYS = {
    "Abteilung",
    "Anzahl der Einheiten",
    "Anzahl der Sitzplätze",
    "Anzahl der Teile",
    "Ausführung",
    "Ausrichtung",
    "Besonderheiten",
    "Breite",
    "Farbe",
    "Form",
    "Füllmaterial",
    "Gestellmaterial",
    "Härtegrad",
    "Holzart",
    "Holzton",
    "Höhe",
    "Länge",
    "Material",
    "Montage erforderlich",
    "Muster",
    "Polsterstoff",
    "Produktart",
    "Rahmenfarbe",
    "Sitzhöhe",
    "Sitztiefe",
    "Stil",
    "Stil der Armlehne",
    "Stil der Rückenlehne",
    "Tiefe",
    "Tischplattenmaterial",
    "Zimmer",
}
AI_SOURCE_EXCLUDED_KEYS = {
    "EAN",
    "Herstellergarantie",
    "Herstellernummer",
    "Marke",
    "Personalisiert",
    "Verpackung",
    "Zusätzlich benötigte Teile",
}


class ProductMapper:
    def __init__(
        self,
        products: list[dict],
        controller: str,
        otto_client: OttoClient | None = None,
        category_group_contexts: dict[str, dict[str, Any]] | None = None,
    ):
        self.products = products
        self._gpt = GPTHelper(settings.gpt_key)
        self.category_group_contexts = category_group_contexts or {}

        self.classifier: CategoryClassifier = CategoryClassifier(
            self._gpt.client,
            sorted(self.category_group_contexts) or settings.CATEGORIES,
        )

        self.bullet_point_generator: BulletPointGenerator = BulletPointGenerator(
            self._gpt.client
        )
        self.description_generator: DescriptionGenerator = DescriptionGenerator(
            self._gpt.client
        )
        self.attribute_generator: AttributeGenerator = AttributeGenerator(
            self._gpt.client
        )

        self.controller = controller
        self.otto_client = otto_client
        self.logger = logging.getLogger("product_mapper_flow")
        self._category_attrs_cache: dict[str, list[dict]] = {}
        self._category_attrs_locks: dict[str, asyncio.Lock] = {}
        self._category_group_prediction_cache: dict[str, dict[str, Any]] = {}

    async def payload_deploy(
        self,
        on_item_finished: Callable[[], Awaitable[None]] | None = None,
        on_item_mapped: Callable[[int, dict], Awaitable[None]] | None = None,
    ):
        result: list[dict | None] = [None] * len(self.products)
        issues: list[dict] = []
        semaphore = asyncio.Semaphore(PRODUCT_AI_CONCURRENCY)

        async def _map_one(index: int, product: dict) -> None:
            xml_data = product.get("CustomItemSpecifics")
            ean = self.prepare_cis(xml_data, {}, True)
            try:
                self.logger.info(
                    "Маппер стартовал index=%s ean=%s",
                    index,
                    ean,
                )
                async with semaphore:
                    mapped = await self.clean_data(product)
                result[index] = mapped
                if on_item_mapped is not None:
                    await on_item_mapped(index, mapped)
                self.logger.info(
                    "Маппер закончился: ean=%s index=%s",
                    ean,
                    index,
                )
            except Exception as exc:
                self.logger.exception(
                    "Маппер провалился ean=%s index=%s error=%s",
                    ean,
                    index,
                    exc,
                )
                issues.append(
                    {
                        "index": index,
                        "message": f"failed to map product: {exc}",
                    }
                )
            finally:
                if on_item_finished is not None:
                    await on_item_finished()

        await asyncio.gather(
            *[_map_one(index, product) for index, product in enumerate(self.products)]
        )

        return {
            "items": [item for item in result if isinstance(item, dict)],
            "items_by_index": result,
            "issues": issues,
        }

    async def clean_data(self, product):
        # ean = product.get("EAN") or product.get("ean")

        result = {
            "Artikelbeschreibung": product["Artikelbeschreibung"],
            "Startpreis": product["Startpreis"],
        }

        xml_data = product.get("CustomItemSpecifics")
        specifics = self._parse_item_specifics(xml_data)
        ean = specifics.get("EAN") or product.get("EAN") or product.get("ean")
        if ean:
            result["EAN"] = ean

        category_source = self._prepare_ai_source(
            product,
            include_descriptions=False,
            include_images=True,
        )

        self.logger.info("Старт генерации категория для ean=%s", ean)
        category_result = await self.get_category(category_source)
        category_group = str(category_result.get("categoryGroup") or "").strip()
        result["categoryGroup"] = category_group
        result["category"] = ""
        self.logger.info(
            "Закончено генерация группы категории для ean=%s category_group=%s category=%s",
            ean,
            category_group,
            result.get("category"),
        )

        return result

    @staticmethod
    def _shape_generated_attributes(attributes: list[dict]) -> list[dict]:
        shaped: list[dict] = []
        for item in attributes:
            if not isinstance(item, dict):
                continue

            name = item.get("name")
            if not isinstance(name, str) or not name.strip():
                continue

            raw_value = item.get("value")
            if isinstance(raw_value, list):
                values = [
                    str(value).strip() for value in raw_value if str(value).strip()
                ]
            elif raw_value is None:
                values = []
            else:
                text = str(raw_value).strip()
                values = [text] if text else []

            if not values:
                continue

            shaped.append(
                {
                    "name": name.strip(),
                    "values": values,
                    "additional": bool(item.get("additional", True)),
                }
            )

        return shaped

    @staticmethod
    def _prepare_ai_source(
        source: dict,
        *,
        include_descriptions: bool = True,
        include_images: bool = False,
    ) -> dict:
        prepared: dict[str, Any] = {}
        title = source.get("Artikelbeschreibung") or source.get("title")
        if isinstance(title, str) and title.strip():
            prepared["Artikelbeschreibung"] = title.strip()

        specifics = ProductMapper._parse_item_specifics(source.get("CustomItemSpecifics"))
        for key in AI_SOURCE_SPECIFIC_KEYS:
            value = specifics.get(key) or source.get(key)
            if ProductMapper._has_ai_value(value):
                prepared[key] = value

        for key, value in source.items():
            if not isinstance(key, str):
                continue
            if key in prepared or key in AI_SOURCE_EXCLUDED_KEYS:
                continue
            if key.startswith("Maße") and ProductMapper._has_ai_value(value):
                prepared[key] = value

        for key, value in specifics.items():
            if key not in prepared and key.startswith("Maße"):
                prepared[key] = value

        if include_images:
            image_urls = ProductMapper._extract_image_urls(source)
            if image_urls:
                prepared["imageUrls"] = image_urls

        if include_descriptions:
            placeholder_values = {"<-StammBeschreibung->", "<-stammbeschreibung->"}
            for key in ("Description", "Beschreibung", "TranslatedDescription"):
                value = source.get(key)
                if isinstance(value, str) and value.strip() in placeholder_values:
                    continue
                if isinstance(value, str) and value.strip():
                    prepared[key] = value.strip()

            stamm_description = source.get("StammartikelBeschreibungDetailsHtml")
            if isinstance(stamm_description, str) and stamm_description.strip():
                prepared["StammartikelBeschreibungDetailsHtml"] = (
                    stamm_description.strip()
                )
                prepared.setdefault("Beschreibung", stamm_description.strip())

        return prepared

    @staticmethod
    def _source_with_product_edits(source: dict | None, product: dict) -> dict:
        merged: dict[str, Any] = dict(source or {})
        product_description = product.get("productDescription")
        description = (
            product_description if isinstance(product_description, dict) else {}
        )

        title = (
            product.get("Artikelbeschreibung")
            or description.get("productLine")
            or product.get("title")
        )
        if isinstance(title, str) and title.strip():
            merged["Artikelbeschreibung"] = title.strip()

        generated_description = description.get("description")
        if isinstance(generated_description, str) and generated_description.strip():
            merged["Beschreibung"] = generated_description.strip()
            merged["Description"] = generated_description.strip()
            merged["TranslatedDescription"] = generated_description.strip()

        bullet_points = description.get("bulletPoints")
        if isinstance(bullet_points, list):
            cleaned_bullets = [
                str(item).strip() for item in bullet_points if str(item).strip()
            ]
            if cleaned_bullets:
                merged["bulletPoints"] = cleaned_bullets

        attributes = description.get("attributes")
        if isinstance(attributes, list):
            for raw_attr in attributes:
                if not isinstance(raw_attr, dict):
                    continue
                name = str(raw_attr.get("name") or "").strip()
                if not name:
                    continue
                raw_values = raw_attr.get("values", raw_attr.get("value"))
                if isinstance(raw_values, list):
                    values = [
                        str(value).strip()
                        for value in raw_values
                        if str(value).strip()
                    ]
                    if not values:
                        continue
                    merged[name] = values[0] if len(values) == 1 else values
                    continue
                if ProductMapper._has_ai_value(raw_values):
                    merged[name] = raw_values

        return merged

    @staticmethod
    def _has_ai_value(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, list):
            return any(ProductMapper._has_ai_value(item) for item in value)
        return True

    @staticmethod
    def _parse_item_specifics(xml_data: Any) -> dict[str, Any]:
        if not isinstance(xml_data, str) or not xml_data.strip():
            return {}

        try:
            root = ET.fromstring(xml_data)
        except ET.ParseError:
            return {}

        result: dict[str, Any] = {}
        for item in root.findall("NameValueList"):
            name = item.findtext("Name")
            if not name:
                continue
            values = [
                value.text.strip()
                for value in item.findall("Value")
                if value.text and value.text.strip()
            ]
            if not values:
                continue
            result[name] = values[0] if len(values) == 1 else values

        return result

    @staticmethod
    def _extract_image_urls(source: dict) -> list[str]:
        raw_values: list[Any] = [
            source.get("PictureURL"),
            source.get("pictureurls"),
            source.get("Bild"),
            source.get("bild"),
        ]
        urls: list[str] = []
        for raw_value in raw_values:
            if not isinstance(raw_value, str):
                continue
            for part in raw_value.replace("\n", ",").replace(";", ",").split(","):
                url = part.strip()
                if url.startswith(("http://", "https://")) and url not in urls:
                    urls.append(url)
        return urls[:5]

    async def enrich_after_category_approval(
        self,
        product: dict,
        *,
        source_item: dict | None = None,
    ) -> dict:
        """Generate the usual AI content after the category has been approved."""
        result = dict(product)
        product_description = dict(result.get("productDescription") or {})
        result["productDescription"] = product_description

        ai_source = self._source_with_product_edits(source_item, product)
        source = self._prepare_ai_source(ai_source)
        compact_source = self._prepare_ai_source(
            ai_source,
            include_descriptions=False,
        )
        category = str(product_description.get("category") or "").strip()
        category_group = str(result.get("aiCategoryGroup") or "").strip()
        if not category_group:
            category_group = self._category_group_for_category(category)
        ean = source.get("EAN") or source.get("ean") or result.get("ean")

        if not category:
            self.logger.info(
                "Категория отсутствует для ean=%s. Скипается генерация аттрибутов, буллет поинтов и описания",
                ean,
            )
            return result

        if not category_group:
            self.logger.info(
                "Группа категории отсутствует для ean=%s category=%s. Используется category как fallback для AI context",
                ean,
                category,
            )
            category_group = category

        self.logger.info(
            "Старт генерации оставшихся свойств для ean=%s category=%s category_group=%s",
            ean,
            category,
            category_group,
        )

        try:
            direct_map = self.direct_map_attrs(compact_source)
            self.logger.info("Атрибуты замапано: ean=%s count=%s", ean, len(direct_map))

            category_attrs_task: asyncio.Task[list[dict]] | None = None
            if category_group:
                category_attrs_task = asyncio.create_task(
                    self._get_cleaned_category_attrs(category_group)
                )

            bullet_source = dict(compact_source)
            bullet_source["bulletPoints"] = []
            self.logger.info("Генерация буллет поинтов: ean=%s", ean)
            bullet_points = await self.get_bullet_points(bullet_source)
            self.logger.info(
                "Буллет поинты сгенерированы для ean=%s",
                ean,
            )

            self.logger.info("Старт генерации описания для ean=%s", ean)
            description_task = asyncio.create_task(
                self.description_generator.generate(
                    source,
                    bullet_points=bullet_points,
                )
            )

            generated_attrs: list[dict] = []
            if category_attrs_task:
                try:
                    self.logger.info(
                            "Генерация оставшихся аттрибутов: ean=%s category_group=%s",
                            ean,
                            category_group,
                        )
                    cleaned_otto_attrs = await category_attrs_task
                    self.logger.info("Клин аттрибутов для ean=%s", ean)
                    direct_attr_names = {item["name"] for item in direct_map}
                    otto_attr_names = {
                        item["name"]
                        for item in cleaned_otto_attrs
                        if isinstance(item.get("name"), str)
                    }
                    if not cleaned_otto_attrs:
                        self.logger.info(
                            "AI аттрибуты скипнуты: ean=%s category_group=%s reason=no_group_attrs",
                            ean,
                            category_group,
                        )
                    elif otto_attr_names and otto_attr_names.issubset(
                        direct_attr_names
                    ):
                        self.logger.info(
                            "AI аттрибуты скипнуты: ean=%s category=%s reason=direct_attrs_cover_otto_attrs",
                            ean,
                            category,
                        )
                    else:
                        generated = await self.attribute_generator.generate(
                            category=category_group,
                            source_attributes=compact_source,
                            bullet_points=bullet_points,
                            otto_attributes=cleaned_otto_attrs,
                            exclude_attributes=direct_map,
                        )
                        generated_attrs = self._shape_generated_attributes(
                            generated.get("attributes", []) or []
                        )
                        self.logger.info("Аттрибуты сгенерированы для ean=%s", ean)

                except httpx.HTTPStatusError as exc:
                    status_code = (
                        exc.response.status_code if exc.response else "unknown"
                    )
                    log_fn = (
                        self.logger.info if status_code == 404 else self.logger.warning
                    )
                    log_fn(
                        "Ошибка генерации ean=%s category_group=%s status=%s",
                        ean,
                        category_group,
                        status_code,
                    )
                except Exception as exc:
                    self.logger.warning(
                        "step=ai_category_group_attrs_generation_failed_fallback_direct_only ean=%s category_group=%s error=%s",
                        ean,
                        category_group,
                        exc,
                    )

            description = await description_task
            self.logger.info("Описания успешно сгенерированы для ean=%s", ean)

            product_description["category"] = category
            product_description["bulletPoints"] = bullet_points
            product_description["description"] = description
            product_description["attributes"] = [*direct_map, *generated_attrs]
            result["productDescription"] = product_description

            self.logger.info("Полгостью успешно сработал маппер для ean=%s", ean)

            return result

        except Exception as exc:
            self.logger.exception(
                "Ошибка маппера для ean=%s\nОшибка: error=%s", ean, exc
            )
            raise

    async def _get_cleaned_category_attrs(self, category_group: str) -> list[dict]:
        cache_key = f"{self.controller}:{category_group.casefold()}"
        cached = self._category_attrs_cache.get(cache_key)
        if cached is not None:
            return cached

        lock = self._category_attrs_locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            cached = self._category_attrs_cache.get(cache_key)
            if cached is not None:
                return cached

            group_context = self.category_group_contexts.get(category_group)
            cleaned_otto_attrs = self.prepare_attrs(group_context or {})
            self._category_attrs_cache[cache_key] = cleaned_otto_attrs
            return cleaned_otto_attrs

    async def get_category(self, product: dict):
        cache_key = hashlib.sha256(
            json.dumps(product, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
        cached = self._category_group_prediction_cache.get(cache_key)
        if cached is not None:
            return cached

        response = await self.classifier.classify(product)
        result = {"categoryGroup": response.get("categoryGroup")}
        self._category_group_prediction_cache[cache_key] = result
        return result

    def _default_category_for_group(self, category_group: str) -> str | None:
        category_group = str(category_group or "").strip()
        if not category_group:
            return None
        group_context = self.category_group_contexts.get(category_group)
        categories = group_context.get("categories") if isinstance(group_context, dict) else None
        if isinstance(categories, list) and categories:
            return str(categories[0])
        return category_group

    def _category_group_for_category(self, category: str) -> str | None:
        if not category:
            return None
        category_key = category.casefold()
        for group_name, group_context in self.category_group_contexts.items():
            categories = group_context.get("categories") if isinstance(group_context, dict) else None
            if not isinstance(categories, list):
                continue
            if any(str(item).casefold() == category_key for item in categories):
                return group_name
        return None

    async def get_bullet_points(self, product: dict):
        product["bulletPoints"] = [
            str(item).strip()
            for item in product.get("bulletPoints", [])
            if str(item).strip() and str(item).strip() != "Made in Europa"
        ]
        if len(product["bulletPoints"]) < 5:
            generated = await self.bullet_point_generator.generate_bullet_points(product)

            if not isinstance(generated, list):
                return product["bulletPoints"]
            return [*product["bulletPoints"], *generated]
        return product["bulletPoints"]

    def direct_map_attrs(self, product: dict) -> list[dict]:
        direct_map = {
            "Breite": self.clean_dimension(product.get("Breite", None)),
            "Tiefe": self.clean_dimension(product.get("Länge", None)),
            "Höhe": self.clean_dimension(product.get("Höhe", None)),
            "Wohnraum": product.get("Zimmer", None),
        }

        return [
            {
                "name": name,
                "values": [str(value).strip()],
                "additional": True,
            }
            for name, value in direct_map.items()
            if value is not None
        ]

    def clean_dimension(self, value: str | None):
        if not value:
            return None

        return value.replace(" cm", "").strip()

    def prepare_attrs(self, category_attributes: Any):
        if isinstance(category_attributes, BaseModel):
            category_attributes = category_attributes.model_dump(mode="json")

        if isinstance(category_attributes, dict):
            if isinstance(category_attributes.get("attributes"), list):
                category_attributes = [category_attributes]
            else:
                category_groups = category_attributes.get("categoryGroups")
                category_attributes = (
                    category_groups if isinstance(category_groups, list) else []
                )

        if not isinstance(category_attributes, list):
            return []

        attrs = []

        for root in category_attributes:
            if not isinstance(root, dict):
                continue
            attributes = root.get("attributes")
            if isinstance(attributes, list):
                attrs.extend(attributes)

        result = []

        for item in attrs:
            if not isinstance(item, dict):
                continue

            if "name" not in item or "type" not in item:
                continue
            if item.get("relevance") == "HIGH":
                result.append(
                    {
                        "name": item["name"],
                        "description": item.get("description"),
                        "type": item["type"],
                        "multiValue": item.get("multiValue", False),
                        "relevance": item.get("relevance"),
                        "allowedValues": item.get("allowedValues"),
                        "recommendedValues": item.get("recommendedValues"),
                        "exampleValues": item.get("exampleValues", []),
                    }
                )

        return result

    def prepare_cis(self, xml_data, result: dict, return_ean=False):
        try:
            root = ET.fromstring(xml_data)
        except ET.ParseError:
            return result

        for item in root.findall("NameValueList"):
            name = item.findtext("Name")

            values = [value.text for value in item.findall("Value") if value.text]

            if not name:
                continue

            result[name] = values[0] if len(values) == 1 else values
        if return_ean:
            return result.get("ean") or result.get("EAN")
