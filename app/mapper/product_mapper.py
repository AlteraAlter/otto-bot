import xml.etree.ElementTree as ET
import logging
import asyncio
import httpx

from app.utils.category_classifier import CategoryClassifier
from app.utils.bullet_point_generator import BulletPointGenerator
from app.utils.description_generator import DescriptionGenerator
from app.utils.attribute_generator import AttributeGenerator

from app.schemas.product_query import CategoryQuery

from app.clients.otto_client import OttoClient

from app.utils.gpt_helper import GPTHelper
from app.core.configs import settings


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

    async def payload_deploy(self):
        result: list[dict | None] = [None] * len(self.products)
        issues: list[dict] = []
        semaphore = asyncio.Semaphore(10)

        async def _map_one(index: int, product: dict) -> None:
            ean = product.get("EAN") or product.get("ean")
            try:
                self.logger.info(
                    "step=mapper_item_start index=%s ean=%s",
                    index,
                    ean,
                )
                async with semaphore:
                    mapped = await self.clean_data(product)
                result[index] = mapped
                self.logger.info(
                    "step=mapper_item_done index=%s ean=%s",
                    index,
                    ean,
                )
            except Exception as exc:
                self.logger.exception(
                    "step=mapper_item_failed index=%s ean=%s error=%s",
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

        await asyncio.gather(
            *[_map_one(index, product) for index, product in enumerate(self.products)]
        )

        return {
            "items": [item for item in result if isinstance(item, dict)],
            "issues": issues,
        }

    async def clean_data(self, product):
        ean = product.get("EAN") or product.get("ean")

        result = {
            "Artikelbeschreibung": product["Artikelbeschreibung"],
            "Startpreis": product["Startpreis"],
        }

        xml_data = product.get("CustomItemSpecifics")

        if not xml_data:
            return result

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

        self.logger.info("step=category_generation_start ean=%s", ean)
        result["category"] = await self.get_category(result)
        self.logger.info(
            "step=category_generation_done ean=%s category=%s",
            ean,
            result.get("category"),
        )
        result["bulletPoints"] = await self.get_bullet_points(result)
        self.logger.info(
            "step=bullet_points_done ean=%s count=%s",
            ean,
            len(result.get("bulletPoints", []) or []),
        )

        self.logger.info("step=description_generation_start ean=%s", ean)
        description = await self.description_generator.generate(
            product, bullet_points=result["bulletPoints"]
        )
        result["description"] = description
        self.logger.info("step=description_generation_done ean=%s", ean)

        direct_map = self.direct_map_attrs(product)
        result["directMappedAttributes"] = direct_map
        self.logger.info(
            "step=direct_attrs_mapped ean=%s count=%s",
            ean,
            len(direct_map),
        )

        generated_attrs: list[dict] = []
        if self.otto_client and result.get("category"):
            try:
                categories_payload = CategoryQuery(
                    category=result["category"], page=0, limit=100
                ).to_payload()
                category_attributes = await self.otto_client.get_categories(
                    categories_payload, controller=self.controller
                )
                cleaned_otto_attrs = self.prepare_attrs(category_attributes)
                self.logger.info(
                    "step=otto_attrs_fetched ean=%s category=%s count=%s",
                    ean,
                    result.get("category"),
                    len(cleaned_otto_attrs),
                )
                generated = await self.attribute_generator.generate(
                    category=result["category"],
                    source_attributes=result,
                    bullet_points=result["bulletPoints"],
                    otto_attributes=cleaned_otto_attrs,
                    exclude_attributes=direct_map,
                )
                if isinstance(generated, dict):
                    generated_attrs = generated.get("attributes", []) or []
                self.logger.info(
                    "step=generated_attrs_done ean=%s count=%s",
                    ean,
                    len(generated_attrs),
                )
            except httpx.HTTPStatusError as exc:
                self.logger.warning(
                    "step=otto_attrs_fetch_failed_fallback_direct_only ean=%s category=%s status=%s",
                    ean,
                    result.get("category"),
                    exc.response.status_code if exc.response else "unknown",
                )
                generated_attrs = []
            except Exception as exc:
                self.logger.warning(
                    "step=otto_attrs_generation_failed_fallback_direct_only ean=%s category=%s error=%s",
                    ean,
                    result.get("category"),
                    exc,
                )
                generated_attrs = []

        result["attributes"] = [*direct_map, *generated_attrs]
        self.logger.info(
            "step=merged_attrs_ready ean=%s total=%s",
            ean,
            len(result["attributes"]),
        )

        return result

    async def get_category(self, product: dict):
        response = await self.classifier.classify(product)
        return response.get("category")

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
