from __future__ import annotations

import pytest

from app.services.otto_instruction_language_service import (
    ATTRIBUTE_NAME,
    TARGET_VALUE,
    prepare_product_for_submit,
    replace_instruction_language_attribute,
    run_instruction_language_update,
)


def test_replace_instruction_language_attribute_only_changes_matching_attribute():
    product = {
        "sku": "SKU-1",
        "productDescription": {
            "brandId": "OLD",
            "attributes": [
                {"name": "Farbe", "values": ["Rot"], "additional": True},
                {
                    "name": ATTRIBUTE_NAME,
                    "values": ["Englisch (EN)", "Deutsch"],
                    "additional": True,
                    "attributeGroup": "Service",
                },
            ],
        },
    }

    updated, already_target = replace_instruction_language_attribute(product)

    assert already_target is False
    assert updated is not None
    assert product["productDescription"]["attributes"][1]["values"] == [
        "Englisch (EN)",
        "Deutsch",
    ]
    assert updated["productDescription"]["attributes"][0]["values"] == ["Rot"]
    assert updated["productDescription"]["attributes"][1] == {
        "name": ATTRIBUTE_NAME,
        "values": [TARGET_VALUE],
        "additional": True,
        "attributeGroup": "Service",
    }


def test_replace_instruction_language_attribute_detects_already_target_value():
    product = {
        "sku": "SKU-1",
        "productDescription": {
            "attributes": [{"name": ATTRIBUTE_NAME, "values": [TARGET_VALUE]}],
        },
    }

    updated, already_target = replace_instruction_language_attribute(product)

    assert updated is None
    assert already_target is True


def test_prepare_product_for_submit_strips_read_only_fields_and_keeps_payload_fields():
    product = {
        "sku": "SKU-1",
        "ean": "123",
        "marketplaceStatus": "ONLINE",
        "activeStatus": True,
        "productDescription": {"attributes": []},
        "pricing": {"standardPrice": {"amount": 10, "currency": "EUR"}, "vat": "FULL"},
        "mediaAssets": [{"type": "IMAGE", "location": "https://example.test/a.jpg"}],
    }

    prepared = prepare_product_for_submit(product, controller="xl")

    assert "marketplaceStatus" not in prepared
    assert "activeStatus" not in prepared
    assert prepared["productDescription"]["brandId"] == "6HMOZBOU"
    assert prepared["sku"] == "SKU-1"
    assert prepared["pricing"] == product["pricing"]


class FakeOttoClient:
    def __init__(self):
        self.submitted: list[tuple[list[dict], str]] = []

    async def get_products_raw(self, payload, controller="jv"):
        assert controller == "jv"
        assert payload == {"page": 0, "limit": 10}
        return {
            "total": 3,
            "productVariations": [
                {
                    "sku": "CHANGED",
                    "productDescription": {
                        "attributes": [{"name": ATTRIBUTE_NAME, "values": ["English"]}],
                    },
                },
                {
                    "sku": "ALREADY",
                    "productDescription": {
                        "attributes": [
                            {"name": ATTRIBUTE_NAME, "values": [TARGET_VALUE]}
                        ],
                    },
                },
                {
                    "sku": "SKIPPED",
                    "productDescription": {
                        "attributes": [{"name": "Farbe", "values": ["Blau"]}],
                    },
                },
            ],
        }

    async def create_or_update_products_raw(self, products, controller="jv"):
        self.submitted.append((products, controller))
        return {
            "state": "pending",
            "message": "Task 11111111-1111-4111-8111-111111111111 accepted",
            "links": [
                {
                    "rel": "self",
                    "href": "/v5/products/update-tasks/11111111-1111-4111-8111-111111111111",
                }
            ],
        }

    async def update_tasks(self, pid, controller="jv"):
        return {"state": "done", "total": 1, "progress": 1, "succeeded": 1, "failed": 0}

    async def failed_tasks(self, pid, controller="jv"):
        raise AssertionError("failed tasks should not be requested")


class StartPageFakeOttoClient:
    async def get_products_raw(self, payload, controller="jv"):
        assert controller == "xl"
        assert payload == {"page": 526, "limit": 100}
        return {
            "productVariations": [],
            "links": [],
        }


@pytest.mark.asyncio
async def test_run_instruction_language_update_submits_only_changed_products():
    client = FakeOttoClient()

    result = await run_instruction_language_update(
        client,  # type: ignore[arg-type]
        controller="jv",
        page_size=10,
        submit_batch_size=10,
        max_retries=0,
    )

    assert result.status == "done"
    assert result.products_scanned == 3
    assert result.products_with_attribute == 2
    assert result.products_already_target == 1
    assert result.products_changed == 1
    assert result.products_submitted == 1
    assert len(client.submitted) == 1
    submitted_products, submitted_controller = client.submitted[0]
    assert submitted_controller == "jv"
    assert [item["sku"] for item in submitted_products] == ["CHANGED"]
    assert submitted_products[0]["productDescription"]["attributes"][0]["values"] == [
        TARGET_VALUE
    ]


@pytest.mark.asyncio
async def test_run_instruction_language_update_can_start_from_resume_page():
    result = await run_instruction_language_update(
        StartPageFakeOttoClient(),  # type: ignore[arg-type]
        controller="xl",
        start_page=526,
        page_size=100,
        max_retries=0,
    )

    assert result.status == "done"
    assert result.start_page == 526
    assert result.pages_fetched == 1
    assert result.products_scanned == 0
