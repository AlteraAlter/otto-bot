import pytest
from httpx import AsyncClient

from app.schemas.product_response import (
    ExternalCategoriesResponse,
    ExternalCategoryAttributesResponse,
)

pytestmark = pytest.mark.asyncio(loop_scope="module")


async def test_get_external_categories_success(client: AsyncClient):
    response = await client.get(
        "/extermal/categories",
        params={
            "page": 0,
            "limit": 10,
        },
    )

    assert response.status_code == 200

    data = response.json()
    validated = ExternalCategoriesResponse.model_validate(data)

    assert isinstance(validated, ExternalCategoriesResponse)
    assert "categoryGroups" not in data
    assert "attributes" not in data
    assert validated.categories
    assert validated.categories[0].id is not None
    assert validated.categories[0].categoryId == validated.categories[0].id
    assert validated.categories[0].name


async def test_get_external_category_attributes_success(client: AsyncClient):
    categories_response = await client.get(
        "/extermal/categories",
        params={
            "page": 0,
            "limit": 10,
        },
    )
    assert categories_response.status_code == 200

    category_id = (
        ExternalCategoriesResponse.model_validate(categories_response.json())
        .categories[0]
        .categoryId
    )
    assert category_id is not None

    response = await client.get(
        "/extermal/attributes",
        params={
            "categoryId": category_id,
        },
    )

    assert response.status_code == 200

    data = response.json()
    validated = ExternalCategoryAttributesResponse.model_validate(data)

    assert isinstance(validated, ExternalCategoryAttributesResponse)
    assert "categoryGroups" not in data
    assert "categories" not in data
    assert validated.attributes
    assert validated.attributes[0].id is not None
    assert validated.attributes[0].attributeId == validated.attributes[0].id
    assert validated.attributes[0].attributeKey == str(validated.attributes[0].id)
