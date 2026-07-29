import unittest

from app.services.product_variation_logic import (
    VariationDimension,
    build_combination_key,
    build_variant_combinations,
    expand_product_variants_for_otto,
    is_supported_variation_attribute,
    preview_variant_generation,
    validate_variant_export_identifiers,
)


class ProductVariationLogicTests(unittest.TestCase):
    def test_only_primary_color_and_material_are_variant_dimensions(self):
        self.assertTrue(is_supported_variation_attribute("Farbe"))
        self.assertTrue(is_supported_variation_attribute("Material"))
        self.assertFalse(is_supported_variation_attribute("Farbe Sitzfläche"))
        self.assertFalse(is_supported_variation_attribute("Farbe Gestell"))
        self.assertFalse(is_supported_variation_attribute("Farbe Korpus"))
        self.assertFalse(is_supported_variation_attribute("Gestellmaterial"))

    def test_combination_key_is_order_independent_and_normalized(self):
        left = build_combination_key({"material": " Leather ", "color": "RED"})
        right = build_combination_key({"color": " red ", "material": "leather"})

        self.assertEqual(left, right)

    def test_preview_counts_source_as_existing(self):
        dimensions = [
            VariationDimension("material", "Material", ("leather", "textile")),
            VariationDimension("color", "Color", ("red", "black", "white")),
        ]

        preview = preview_variant_generation(dimensions)

        self.assertEqual(preview["totalCombinations"], 6)
        self.assertEqual(preview["existingCombinations"], 1)
        self.assertEqual(preview["newCombinations"], 5)

    def test_preview_skips_existing_matching_combinations(self):
        dimensions = [
            VariationDimension("material", "Material", ("leather", "textile")),
            VariationDimension("color", "Color", ("red", "black")),
        ]
        combinations = build_variant_combinations(dimensions)

        preview = preview_variant_generation(
            dimensions,
            existing_combination_keys=[combinations[1].key],
        )

        self.assertEqual(preview["totalCombinations"], 4)
        self.assertEqual(preview["existingCombinations"], 2)
        self.assertEqual(preview["newCombinations"], 2)

    def test_expand_without_variants_preserves_single_product_payload(self):
        product = {
            "productReference": "REF-1",
            "sku": "SKU-1",
            "ean": "EAN-1",
            "variants": [],
        }

        expanded = expand_product_variants_for_otto(product)

        self.assertEqual(len(expanded), 1)
        self.assertNotIn("variants", expanded[0])
        self.assertEqual(expanded[0]["sku"], "SKU-1")

    def test_expand_variants_creates_individual_payloads(self):
        product = {
            "productReference": "REF-1",
            "sku": "BASE",
            "ean": "BASE-EAN",
            "productDescription": {
                "attributes": [
                    {"name": "Material", "values": ["leather", "textile"]},
                    {"name": "Color", "values": ["red", "black"]},
                    {"name": "Room", "values": ["Living room"]},
                ]
            },
            "pricing": {"standardPrice": {"amount": 100, "currency": "EUR"}},
            "mediaAssets": [
                {"type": "IMAGE", "location": "https://example.com/base.jpg"}
            ],
            "variants": [
                {
                    "combinationKey": "one",
                    "sku": "SKU-1",
                    "ean": "EAN-1",
                    "price": "120",
                    "imageUrl": "https://example.com/variant.jpg",
                    "combination": [
                        {
                            "attributeId": "material",
                            "name": "Material",
                            "value": "textile",
                        },
                        {"attributeId": "color", "name": "Color", "value": "black"},
                    ],
                }
            ],
        }

        expanded = expand_product_variants_for_otto(product)

        self.assertEqual(len(expanded), 1)
        self.assertEqual(expanded[0]["productReference"], "REF-1")
        self.assertEqual(expanded[0]["sku"], "SKU-1")
        self.assertEqual(expanded[0]["ean"], "EAN-1")
        self.assertEqual(expanded[0]["pricing"]["standardPrice"]["amount"], 120.0)
        self.assertEqual(
            expanded[0]["mediaAssets"][0]["location"], "https://example.com/variant.jpg"
        )
        attrs = expanded[0]["productDescription"]["attributes"]
        values_by_name = {item["name"]: item["values"] for item in attrs}
        self.assertEqual(values_by_name["Material"], ["textile"])
        self.assertEqual(values_by_name["Color"], ["black"])
        self.assertEqual(values_by_name["Room"], ["Living room"])

    def test_variant_payload_uses_parent_as_source_of_truth(self):
        product = {
            "productReference": "REF-1",
            "sku": "BASE",
            "ean": "BASE-EAN",
            "productDescription": {
                "brandId": "BRAND",
                "productLine": "Edited parent title",
                "category": "Sofa",
                "bulletPoints": ["One"],
                "description": "Edited parent description",
                "attributes": [{"name": "Color", "values": ["red", "black"]}],
            },
            "pricing": {
                "standardPrice": {"amount": 250, "currency": "EUR"},
                "vat": "FULL",
            },
            "mediaAssets": [
                {"type": "IMAGE", "location": "https://example.com/base.jpg"}
            ],
            "shippingProfileID": "shipping-1",
            "variants": [
                {
                    "combinationKey": "one",
                    "sku": "SKU-1",
                    "ean": "EAN-1",
                    "imageUrl": "/generated-media/local.jpg",
                    "combination": [
                        {"attributeId": "color", "name": "Color", "value": "black"},
                    ],
                    "productPayload": {
                        "productReference": "REF-1",
                        "sku": "OLD",
                        "ean": "OLD-EAN",
                        "productDescription": {
                            "brandId": "BRAND",
                            "productLine": "Old stale title",
                            "category": "Sofa",
                            "bulletPoints": ["Old"],
                            "description": "Old stale description",
                            "attributes": [{"name": "Color", "values": ["red"]}],
                        },
                        "pricing": {
                            "standardPrice": {"amount": 0, "currency": "EUR"},
                            "vat": "FULL",
                        },
                        "mediaAssets": [
                            {
                                "type": "IMAGE",
                                "location": "https://example.com/stale.jpg",
                            }
                        ],
                    },
                }
            ],
        }

        expanded = expand_product_variants_for_otto(product)
        payload = expanded[0]

        self.assertEqual(payload["sku"], "SKU-1")
        self.assertEqual(payload["ean"], "EAN-1")
        self.assertEqual(
            payload["productDescription"]["productLine"], "Edited parent title"
        )
        self.assertEqual(
            payload["productDescription"]["description"], "Edited parent description"
        )
        self.assertEqual(payload["pricing"]["standardPrice"]["amount"], 250)
        self.assertEqual(
            payload["mediaAssets"][0]["location"], "https://example.com/base.jpg"
        )
        self.assertEqual(payload["shippingProfileID"], "shipping-1")

    def test_variant_generated_local_image_is_made_absolute_for_otto(self):
        product = {
            "productReference": "REF-1",
            "sku": "BASE",
            "ean": "BASE-EAN",
            "productDescription": {
                "attributes": [{"name": "Color", "values": ["red", "black"]}],
            },
            "mediaAssets": [
                {"type": "IMAGE", "location": "https://example.com/base.jpg"}
            ],
            "variants": [
                {
                    "combinationKey": "one",
                    "sku": "SKU-1",
                    "ean": "EAN-1",
                    "imageUrl": "/generated-media/variant-black.jpg",
                    "mediaAssets": [
                        {
                            "type": "IMAGE",
                            "location": "/generated-media/variant-black.jpg",
                        }
                    ],
                    "combination": [
                        {"attributeId": "color", "name": "Color", "value": "black"},
                    ],
                }
            ],
        }

        expanded = expand_product_variants_for_otto(
            product,
            media_base_url="https://otto-bot.example",
        )

        self.assertEqual(
            expanded[0]["mediaAssets"][0]["location"],
            "https://otto-bot.example/generated-media/variant-black.jpg",
        )

    def test_validate_variant_export_identifiers(self):
        products = [
            {
                "productReference": "REF-1",
                "variants": [
                    {
                        "combinationKey": "one",
                        "sku": "SKU-1",
                        "ean": "EAN-1",
                        "combination": [],
                    },
                    {
                        "combinationKey": "two",
                        "sku": "SKU-1",
                        "ean": "",
                        "combination": [],
                    },
                ],
            }
        ]

        errors = validate_variant_export_identifiers(products)
        codes = [item["code"] for item in errors]

        self.assertIn("duplicate_sku", codes)
        self.assertIn("missing_ean", codes)


if __name__ == "__main__":
    unittest.main()
