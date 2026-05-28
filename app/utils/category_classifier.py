import json
from app.core.configs import settings

from openai import AsyncOpenAI


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
        You are an OTTO marketplace category classifier.

        Rules:
        - Select EXACTLY ONE category.
        - Category MUST exist in provided category list.
        - Never invent categories.
        - Analyze title, description and attributes.
        - Return valid JSON only.
        
        Format:
        {
            "category": "..."
        }
        """

        user_prompt = f"""
        PRODUCT:
        {json.dumps(product, ensure_ascii=False)}
        
        AVAILABLE CATEGORIES:
        
        {json.dumps(self.categories, ensure_ascii=False)}
        """

        response = await self.client.responses.create(
            model=self.model,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "category_response",
                    "schema": {
                        "type": "object",
                        "properties": {"category": {"type": "string"}},
                        "required": ["category"],
                        "additionalProperties": False,
                    },
                }
            },
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )

        data = json.loads(response.output_text)

        if data["category"] not in self.categories:
            raise ValueError(f"Возвращена неправильная категория: {data['category']}")
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
    from app.core.configs import settings
    from .gpt_helper import GPTHelper
    import asyncio

    res = asyncio.run(main())
    print(res)
