import json

from openai import AsyncOpenAI


class BulletPointGenerator:
    def __init__(self, client: AsyncOpenAI, model: str = "gpt-5-nano"):
        self.client = client
        self.model = model

    async def generate_bullet_points(self, product: dict):
        existing_bullet_points = [
            str(item).strip()
            for item in product.get("bulletPoints", [])
            if str(item).strip()
        ]
        remaining = 5 - len(existing_bullet_points)
        if remaining <= 0:
            return []

        system_prompt = """
        You are a professional OTTO marketplace copywriter.

        Your task is to create factual, useful OTTO marketplace bullet points
        from the product data.

        Rules:

        - Generate EXACTLY the requested number of bullet points.
        - German language only.
        - Use concrete product facts instead of generic marketing claims.
        - Prefer information in this priority order:
        1. Maße (Länge, Breite, Höhe)
        2. Material
        3. Farbe
        4. Besondere Eigenschaften
        5. Lieferumfang
        6. Pflegehinweise
        7. Einsatzbereich / Verwendungszweck
        8. Belastbarkeit, falls relevant
        9. Montageinformationen, falls relevant
        10. Herstellungsland, only if explicitly present or important.
        - It is allowed and encouraged to mention dimensions, material, color,
          assembly, care, delivery scope, load capacity, and use case when present.
        - Keep each bullet clear and natural, not a raw key-value dump.
        - Do not start bullets with labels like "Material:" or "Farbe:".
        - Do not use "Made in Europa" unless the product data explicitly says so.
        - Do not mention:
        - EAN
        - manufacturer number
        - warranty
        - brand name
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

        ✓ Maße ca. 240 x 100 x 90 cm passend für großzügige Wohnbereiche
        ✓ Bezug aus beigem Stoff mit angenehm wohnlicher Oberfläche
        ✓ Verstellbare Relaxfunktion für bequemes Sitzen und Zurücklehnen
        ✓ Lieferumfang: 1 Fernsehsessel für den Innenbereich
        ✓ Montage erforderlich, Aufbau mit wenigen Handgriffen möglich

        Bad examples:

        ✗ Modernes Design für viele Einrichtungsstile
        ✗ Hochwertige Verarbeitung für langanhaltende Freude
        ✗ Made in Europa
        ✗ Farbe: Weiß
        ✗ Material: Holz
        ✗ Marke JV Möbel

        Return JSON only.
        """

        user_prompt = f"""
        Generate exactly {remaining} bullet points.

        Product:
        {json.dumps(product, ensure_ascii=False)}

        Existing bullet points:
        {json.dumps(existing_bullet_points, ensure_ascii=False)}
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
            "bulletPoints": [],
        }
    )


if __name__ == "__main__":
    import asyncio

    from ..core.configs import settings
    from .gpt_helper import GPTHelper

    res = asyncio.run(main())
    print(res)
