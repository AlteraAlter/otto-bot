import json

from openai import AsyncOpenAI

from app.core.configs import settings


class CategoryClassifier:
    def __init__(
        self,
        client: AsyncOpenAI,
        categories: list[str] = settings.CATEGORIES,
        model: str = "gpt-5-nano",
    ):
        self.client = client
        self.categories = categories
        self.model = model

    async def classify(self, product: dict):
        system_prompt = """
        You are an OTTO marketplace category-group classifier.

        Rules:
        - Select EXACTLY ONE category group.
        - Category group MUST exist in provided category group list.
        - Never invent categories.
        - Analyze title, image, description and attributes.
        - Return valid JSON only.

        Format:
        {
            "categoryGroup": "..."
        }
        """

        image_urls = product.get("imageUrls")
        if not isinstance(image_urls, list):
            image_urls = []
        image_urls = [
            url
            for url in image_urls
            if isinstance(url, str)
            and (url.startswith("http://") or url.startswith("https://"))
        ][:1]

        user_prompt = f"""
        PRODUCT:
        {json.dumps(product, ensure_ascii=False)}

        AVAILABLE CATEGORY GROUPS:

        {json.dumps(self.categories, ensure_ascii=False)}
        """

        user_content = user_prompt
        if image_urls:
            user_content = [
                {"type": "input_text", "text": user_prompt},
                {"type": "input_image", "image_url": image_urls[0], "detail": "low"},
            ]

        response = await self.client.responses.create(
            model=self.model,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "category_response",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "categoryGroup": {"type": "string"},
                        },
                        "required": ["categoryGroup"],
                        "additionalProperties": False,
                    },
                }
            },
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )

        data = json.loads(response.output_text)

        if data["categoryGroup"] not in self.categories:
            raise ValueError(
                f"Возвращена неправильная категория: {data['categoryGroup']}"
            )
        return data


async def main():
    gpt = GPTHelper(settings.gpt_key)

    classifier = CategoryClassifier(gpt.client, settings.CATEGORIES)
    return await classifier.classify(
        {
            "Breite": "59 cm",
            "Farbe": "Schwarz",
            "Höhe": "93 cm",
            "Länge": "55 cm",
            "Marke": "JV Möbel",
            "Produktart": "Esszimmerstuhl",
            "Zimmer": "Esszimmer",
            "Gestellmaterial": "Holz",
            "Anzahl der Teile": "1",
            "Stil": "Modern",
            "Montage erforderlich": "Ja",
            "Abteilung": "Erwachsene",
            "Montagezustand": "Montage erforderlich",
            "Holzton": "Mitteldunkles Holz",
            "Herstellernummer": "JVM4067282593664",
            "Innen-/Außenbereich": "Innenbereich",
            "Zusätzlich benötigte Teile": "Nein",
            "Polsterstoff": "Stoff",
            "Muster": "Einfarbig",
            "Herstellergarantie": "2 Jahre",
            "Personalisiert": "Nein",
            "EAN": "4067282593664",
            "Maße Stuhl": "ca: 55 x 59 x 93 cm",
        }
    )


if __name__ == "__main__":
    import asyncio

    from app.core.configs import settings
    from app.core.logger import logging

    from .gpt_helper import GPTHelper

    res = asyncio.run(main())
    logging.getLogger(__name__).info("Категория классифицирована: result=%s", res)
