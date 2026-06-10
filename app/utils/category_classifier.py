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
        You are an OTTO marketplace category classifier.

        Rules:
        - Select EXACTLY ONE category.
        - Category MUST exist in provided category list.
        - Never invent categories.
        - Analyze title, description and attributes.
        - Return confidence for how certain you are about the category.
        - Confidence MUST be a number between 0 and 100.
        - Return valid JSON only.

        Format:
        {
            "category": "...",
            "confidence": 96
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
                        "properties": {
                            "category": {"type": "string"},
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 100,
                            },
                        },
                        "required": ["category", "confidence"],
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
        raw_confidence = data.get("confidence", 0)
        if isinstance(raw_confidence, str):
            try:
                raw_confidence = float(raw_confidence)
            except ValueError:
                raw_confidence = 0
        confidence = (
            float(raw_confidence) if isinstance(raw_confidence, (int, float)) else 0
        )
        if 0 <= confidence <= 1:
            confidence *= 100
        data["confidence"] = max(0, min(100, int(round(confidence))))
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

    from .gpt_helper import GPTHelper

    res = asyncio.run(main())
    print(res)
