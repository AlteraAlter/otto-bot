import asyncio
import json
from types import SimpleNamespace

from app.mapper.product_mapper import ProductMapper
from app.utils.attribute_generator import AttributeGenerator


class _FakeResponses:
    def __init__(self):
        self.request = None

    async def create(self, **kwargs):
        self.request = kwargs
        return SimpleNamespace(output_text=json.dumps({"attributes": []}))


class _FakeClient:
    def __init__(self):
        self.responses = _FakeResponses()


def test_attribute_generator_sends_product_images_to_responses_api():
    client = _FakeClient()
    generator = AttributeGenerator(client)  # type: ignore[arg-type]

    result = asyncio.run(
        generator.generate(
            category="Sofa",
            source_attributes={"Farbe": "Blau", "imageUrls": ["https://ignored"]},
            bullet_points=[],
            otto_attributes=[{"name": "Farbe", "type": "STRING"}],
            exclude_attributes=[],
            image_urls=[
                "https://example.com/front.jpg",
                "https://example.com/detail.jpg",
            ],
        )
    )

    assert result == {"attributes": []}
    content = client.responses.request["input"][1]["content"]
    assert content[0]["type"] == "input_text"
    assert "https://ignored" not in content[0]["text"]
    assert content[1:] == [
        {
            "type": "input_image",
            "image_url": "https://example.com/front.jpg",
            "detail": "high",
        },
        {
            "type": "input_image",
            "image_url": "https://example.com/detail.jpg",
            "detail": "high",
        },
    ]


def test_product_image_extraction_supports_media_assets_and_deduplicates():
    urls = ProductMapper._extract_image_urls(
        {
            "PictureURL": "https://example.com/front.jpg",
            "mediaAssets": [
                {"location": "https://example.com/front.jpg"},
                {"url": "https://example.com/side.jpg"},
                {"filename": "https://example.com/detail.jpg"},
                {"location": "https://example.com/fourth.jpg"},
            ],
        }
    )

    assert urls == [
        "https://example.com/front.jpg",
        "https://example.com/side.jpg",
        "https://example.com/detail.jpg",
    ]


def test_prepare_attrs_keeps_all_prefiltered_category_attributes():
    mapper = ProductMapper.__new__(ProductMapper)
    result = mapper.prepare_attrs(
        {
            "attributes": [
                {"name": "Farbe", "type": "STRING", "relevance": "HIGH"},
                {
                    "name": "Stil",
                    "type": "STRING",
                    "relevance": "MEDIUM",
                },
                {
                    "name": "Material",
                    "type": "STRING",
                    "relevance": "LOW",
                    "isVariationTheme": True,
                },
            ]
        }
    )

    assert [item["name"] for item in result] == ["Farbe", "Stil", "Material"]


def test_primary_farbe_autofills_empty_component_colors():
    result = ProductMapper._autofill_color_attributes(
        [{"name": "Farbe", "values": ["Blau"]}],
        [
            {"name": "Farbe", "allowedValues": ["Blau", "Rot"]},
            {"name": "Farbe Rückenlehne", "allowedValues": ["Blau", "Rot"]},
            {"name": "Farbe Sitzfläche", "allowedValues": []},
            {"name": "Lichtfarbe", "allowedValues": ["Warmweiß"]},
        ],
    )

    by_name = {item["name"]: item["values"] for item in result}
    assert by_name["Farbe"] == ["Blau"]
    assert by_name["Farbe Rückenlehne"] == ["Blau"]
    assert by_name["Farbe Sitzfläche"] == ["Blau"]
    assert "Lichtfarbe" not in by_name


def test_primary_farbe_does_not_overwrite_specific_component_color():
    result = ProductMapper._autofill_color_attributes(
        [
            {"name": "Farbe", "values": ["Blau"]},
            {"name": "Farbe Rückenlehne", "values": ["Schwarz"]},
        ],
        [{"name": "Farbe Rückenlehne", "allowedValues": []}],
    )

    by_name = {item["name"]: item["values"] for item in result}
    assert by_name["Farbe Rückenlehne"] == ["Schwarz"]
