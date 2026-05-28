import xml.etree.ElementTree as ET
import logging

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

    async def payload_deploy(self, run_id: str | None = None):
        result: list[dict] = []
        issues: list[dict] = []

        for index, product in enumerate(self.products):
            ean = product.get("EAN") or product.get("ean")
            try:
                self.logger.info(
                    "[run_id=%s] mapper item_start index=%s ean=%s",
                    run_id,
                    index,
                    ean,
                )
                result.append(await self.clean_data(product, run_id=run_id))
                self.logger.info(
                    "[run_id=%s] mapper item_done index=%s ean=%s",
                    run_id,
                    index,
                    ean,
                )
            except Exception as exc:
                self.logger.exception(
                    "[run_id=%s] mapper item_failed index=%s ean=%s error=%s",
                    run_id,
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

        return {
            "items": result,
            "issues": issues,
        }

    async def clean_data(self, product, run_id: str | None = None):
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

        self.logger.info("[run_id=%s] category generation start ean=%s", run_id, ean)
        result["category"] = await self.get_category(result)
        self.logger.info(
            "[run_id=%s] category generation done ean=%s category=%s",
            run_id,
            ean,
            result.get("category"),
        )
        result["bulletPoints"] = await self.get_bullet_points(result)
        self.logger.info(
            "[run_id=%s] bullet points done ean=%s count=%s",
            run_id,
            ean,
            len(result.get("bulletPoints", []) or []),
        )

        self.logger.info("[run_id=%s] description generation start ean=%s", run_id, ean)
        description = await self.description_generator.generate(
            product, bullet_points=result["bulletPoints"]
        )
        result["description"] = description
        self.logger.info("[run_id=%s] description generation done ean=%s", run_id, ean)

        direct_map = self.direct_map_attrs(product)
        result["directMappedAttributes"] = direct_map
        self.logger.info(
            "[run_id=%s] direct attrs mapped ean=%s count=%s",
            run_id,
            ean,
            len(direct_map),
        )

        generated_attrs: list[dict] = []
        if self.otto_client and result.get("category"):
            categories_payload = CategoryQuery(
                category=result["category"], page=0, limit=100
            ).to_payload()
            category_attributes = await self.otto_client.get_categories(
                categories_payload, controller=self.controller
            )
            cleaned_otto_attrs = self.prepare_attrs(category_attributes)
            self.logger.info(
                "[run_id=%s] otto attrs fetched ean=%s category=%s count=%s",
                run_id,
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
                "[run_id=%s] generated attrs done ean=%s count=%s",
                run_id,
                ean,
                len(generated_attrs),
            )

        result["attributes"] = [*direct_map, *generated_attrs]
        self.logger.info(
            "[run_id=%s] merged attrs ready ean=%s total=%s",
            run_id,
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
                "value": value,
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
            if item.get("relevance") in ("HIGH", "MEDIUM", "LOW"):
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
