import xml
import xml.etree.ElementTree as ET
import logging
import asyncio
from collections.abc import Awaitable, Callable
from xxlimited import Str
import httpx

from app.utils.category_classifier import CategoryClassifier
from app.utils.bullet_point_generator import BulletPointGenerator
from app.utils.description_generator import DescriptionGenerator
from app.utils.attribute_generator import AttributeGenerator

from app.schemas.product_query import CategoryQuery

from app.clients.otto_client import OttoClient

from app.utils.gpt_helper import GPTHelper
from app.core.configs import settings

PRODUCT_AI_CONCURRENCY = 10


class ProductMapper:
    def __init__(
        self,
        products: list[dict],
        controller: str,
        otto_client: OttoClient | None = None,
    ):
        self.products = products
        self._gpt = GPTHelper(settings.gpt_key)

        self.classifier: CategoryClassifier = CategoryClassifier(
            self._gpt.client, settings.CATEGORIES
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

    async def payload_deploy(
        self,
        on_item_finished: Callable[[], Awaitable[None]] | None = None,
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
                self.logger.info(
                    "Маппер закончился: ean=%s index=%s",
                    index,
                    ean,
                )
            except Exception as exc:
                self.logger.exception(
                    "Маппер провалился ean=%s index=%s error=%s",
                    index,
                    ean,
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
            "issues": issues,
        }

    async def clean_data(self, product):
        # ean = product.get("EAN") or product.get("ean")

        result = {
            "Artikelbeschreibung": product["Artikelbeschreibung"],
            "Startpreis": product["Startpreis"],
        }

        xml_data = product.get("CustomItemSpecifics")

        ean = self.prepare_cis(xml_data, result)

        self.logger.info("Старт генерации категория для ean=%s", ean)
        category_result = await self.get_category(result)
        result["category"] = category_result.get("category")
        result["categoryConfidence"] = int(category_result.get("confidence") or 0)
        self.logger.info(
            "Закончено генерация категории для ean=%s category=%s confidence=%s",
            ean,
            result.get("category"),
            result.get("categoryConfidence"),
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
                values = [str(value).strip() for value in raw_value if str(value).strip()]
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

        source = source_item or product
        category = str(product_description.get("category") or "").strip()
        ean = source.get("EAN") or source.get("ean") or result.get("ean")

        if not category:
            self.logger.info(
                "Категория отсутствует для ean=%s. Скипается генерация аттрибутов, буллет поинтов и описания",
                ean,
            )
            return result

        self.logger.info(
            "Старт генерации оставшихся свойств для ean=%s с категорией category=%s",
            ean,
            category,
        )

        try:
            direct_map = self.direct_map_attrs(source)
            self.logger.info(
                "Атрибуты замапано: ean=%s count=%s", ean, len(direct_map))

            category_attrs_task: asyncio.Task[list[dict]] | None = None
            if self.otto_client:
                category_attrs_task = asyncio.create_task(
                    self._get_cleaned_category_attrs(category)
                )

            bullet_source = dict(source)
            bullet_source["bulletPoints"] = ["Made in Europa"]
            self.logger.info("step=ai_bullet_points_start ean=%s", ean)
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
                        "Генерация оставшихся аттрибутов: ean=%s category=%s",
                        ean,
                        category,
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
                            "AI аттрибуты скипнуты: ean=%s category=%s reason=no_otto_attrs",
                            ean,
                            category,
                        )
                    elif otto_attr_names and otto_attr_names.issubset(direct_attr_names):
                        self.logger.info(
                            "AI аттрибуты скипнуты: ean=%s category=%s reason=direct_attrs_cover_otto_attrs",
                            ean,
                            category,
                        )
                    else:
                        generated = await self.attribute_generator.generate(
                            category=category,
                            source_attributes=source,
                            bullet_points=bullet_points,
                            otto_attributes=cleaned_otto_attrs,
                            exclude_attributes=direct_map,
                        )
                        generated_attrs = self._shape_generated_attributes(
                            generated.get("attributes", []) or []
                        )
                        self.logger.info("Аттрибуты сгенерированы для ean=%s", ean)

                except httpx.HTTPStatusError as exc:
                    status_code = exc.response.status_code if exc.response else "unknown"
                    log_fn = self.logger.info if status_code == 404 else self.logger.warning
                    log_fn(
                        "Ошибка генерации ean=%s category=%s status=%s",
                        ean,
                        category,
                        status_code,
                    )
                except Exception as exc:
                    self.logger.warning(
                        "step=ai_otto_category_attrs_generation_failed_fallback_direct_only ean=%s category=%s error=%s",
                        ean,
                        category,
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
            self.logger.exception("Ошибка маппера для ean=%s\nОшибка: error=%s", ean, exc)
            raise

    async def _get_cleaned_category_attrs(self, category: str) -> list[dict]:
        cache_key = f"{self.controller}:{category.casefold()}"
        cached = self._category_attrs_cache.get(cache_key)
        if cached is not None:
            return cached

        lock = self._category_attrs_locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            cached = self._category_attrs_cache.get(cache_key)
            if cached is not None:
                return cached

            if not self.otto_client:
                self._category_attrs_cache[cache_key] = []
                return []

            categories_payload = CategoryQuery(
                category=category,
                page=0,
                limit=100,
            ).to_payload()
            category_attributes = await self.otto_client.get_categories(
                categories_payload,
                controller=self.controller,
            )
            cleaned_otto_attrs = self.prepare_attrs(category_attributes)
            self._category_attrs_cache[cache_key] = cleaned_otto_attrs
            return cleaned_otto_attrs

    async def get_category(self, product: dict):
        response = await self.classifier.classify(product)
        return {
            "category": response.get("category"),
            "confidence": int(response.get("confidence") or 0),
        }

    async def get_bullet_points(self, product: dict):
        product["bulletPoints"] = [
            "Made in Europa",
            *(f"{k}: {v}" for k, v in product.items() if k.startswith("Maße")),
        ]
        if len(product["bulletPoints"]) < 5:
            generated = await self.bullet_point_generator.generate_bullet_points(
                product
            )
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

    def prepare_attrs(self, category_attributes: list[dict]):
        attrs = []

        for root in category_attributes:
            for value in root.values():
                if isinstance(value, list):
                    attrs.extend(value)

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
