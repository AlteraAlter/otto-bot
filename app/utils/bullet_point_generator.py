import json

from openai import AsyncOpenAI


class BulletPointGenerator:
    def __init__(self, client: AsyncOpenAI, model: str = "gpt-5-nano"):
        self.client = client
        self.model = model

    async def generate_bullet_points(self, product: dict):
        remaining = 5 - len(product["bulletPoints"])

        system_prompt = f"""
        You are a professional OTTO marketplace copywriter.

        Your task is to create sales-oriented bullet points.

        Rules:

        - Generate EXACTLY the requested number of bullet points.
        - German language only.
        - Write benefits, not attribute lists.
        - Focus on customer value.
        - Sound natural and premium.
        - Do not simply repeat product attributes.
        - Do not mention:
        - dimensions
        - EAN
        - manufacturer number
        - warranty
        - brand name
        - room names
        - assembly information
        - Avoid phrases like:
        - "Material: ..."
        - "Farbe: ..."
        - "Maße ..."
        - "2 Schubladen"
        - Instead explain WHY the feature is useful.
        - Every bullet must be unique.
        - Maximum 100 characters per bullet.
        
        Only mention features that can reasonably be inferred from the product data.

        Do not invent:
        - premium quality
        - scratch resistance
        - easy-care surfaces
        - durability
        - special coatings
        - comfort properties

        unless clearly supported by product attributes.

        Good examples:

        ✓ Modernes Design für ein stilvolles Wohnambiente
        ✓ Praktischer Stauraum für mehr Ordnung im Alltag
        ✓ Hochwertige Verarbeitung für langanhaltende Freude
        ✓ Zeitlose Optik passend zu vielen Einrichtungsstilen
        ✓ Durchdachte Konstruktion für komfortable Nutzung

        Bad examples:

        ✗ Farbe Weiß
        ✗ Material Holz
        ✗ Mit 2 Schubladen
        ✗ Maße 70 x 44 x 59 cm
        ✗ Marke JV Möbel

        Return JSON only.
        """

        user_prompt = f"""
        Generate exactly {remaining} bullet points.

        Product:
        {json.dumps(product, ensure_ascii=False)}

        Existing bullet points:
        {json.dumps(product.get("bulletPoints"), ensure_ascii=False)}
        """

        response = await self.client.responses.create(
            model=self.model,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "bullet_points_response",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "bullet_points": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": remaining,
                                "maxItems": remaining,
                            }
                        },
                        "required": ["bullet_points"],
                        "additionalProperties": False,
                    },
                }
            },
            input=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
        )

        data = json.loads(response.output_text)

        return data["bullet_points"]


async def main():
    gpt = GPTHelper(settings.gpt_key)

    bpg = BulletPointGenerator(gpt.client)
    return await bpg.generate_bullet_points(
        {
            "Artikelbeschreibung": "Schwarzer Polsterstuhl Designer Holzfüße Esszimmerstuhl Holzgestell Neu",
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
            "bulletPoints": ["Made in Europa"],
        }
    )


if __name__ == "__main__":
    import asyncio
    from .gpt_helper import GPTHelper
    from ..core.configs import settings

    res = asyncio.run(main())
    print(res)
