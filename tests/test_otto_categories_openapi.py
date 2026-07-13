import asyncio
from unittest.mock import AsyncMock

from app.api.routes.products import (
    _is_relevant_category_attribute,
    get_otto_v5_product_categories,
)
from app.main import app
from app.models.attributes import Attribute
from app.schemas.enums import Controller


def test_direct_otto_categories_endpoint_is_exposed_in_openapi():
    operation = app.openapi()["paths"]["/v5/products/categories"]["get"]

    assert operation["summary"] == "Fetch category information directly from OTTO"
    assert {parameter["name"] for parameter in operation["parameters"]} >= {
        "page",
        "limit",
        "category",
        "controller",
    }
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]


def test_direct_otto_categories_endpoint_forwards_controller():
    product_service = AsyncMock()
    product_service.get_categories.return_value = {"categoryGroups": []}

    response = asyncio.run(
        get_otto_v5_product_categories(
            page=0,
            limit=10,
            category=None,
            controller=Controller.XL,
            product_service=product_service,
        )
    )

    assert response == {"categoryGroups": []}
    product_service.get_categories.assert_awaited_once_with(
        {"page": 0, "limit": 10},
        controller=Controller.XL,
    )


def test_only_important_legal_or_variation_attributes_are_relevant_by_default():
    low = Attribute(name="Optional", type="STRING", relevance="LOW")
    high = Attribute(name="Important", type="STRING", relevance="HIGH")
    medium = Attribute(name="Useful", type="STRING", relevance="MEDIUM")
    legal = Attribute(
        name="Mandatory",
        type="STRING",
        relevance="LOW",
        feature_relevance=["LEGAL"],
    )
    variation = Attribute(
        name="Color",
        type="STRING",
        relevance="LOW",
        feature_relevance=["VARIATION_THEME"],
    )
    component_color = Attribute(
        name="Farbe Rückenlehne",
        type="STRING",
        relevance="LOW",
    )

    assert not _is_relevant_category_attribute(low)
    assert _is_relevant_category_attribute(high)
    assert _is_relevant_category_attribute(medium)
    assert _is_relevant_category_attribute(legal)
    assert _is_relevant_category_attribute(variation)
    assert _is_relevant_category_attribute(component_color)
