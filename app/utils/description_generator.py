import json

from openai import AsyncOpenAI


class DescriptionGenerator:
    def __init__(self, client: AsyncOpenAI, model: str = "gpt-5-nano"):
        self.client = client
        self.model = model

    async def generate(self, product: dict, bullet_points: list[str]) -> str:

        system_prompt = """
        You are a professional OTTO marketplace furniture copywriter.

        Task:
        Create a high-quality product description in German for an OTTO marketplace listing.

        Rules:

        - Length: 500-900 characters.
        - German language only.
        - Natural, professional and trustworthy tone.
        - Focus on the overall impression, design and everyday use of the product.
        - Explain how the product fits into a living space.
        - Highlight practical benefits when supported by product data.
        - Mention important materials and visual characteristics when available.
        - If StammartikelBeschreibungDetailsHtml is present, use it as a trusted
        source for product details, materials, colors and dimensions.

        Do NOT:

        - Repeat bullet points word for word.
        - Copy HTML tags or raw tab/panel text into the description.
        - List attributes one after another.
        - Turn the description into a specification sheet.
        - Mention EAN.
        - Mention manufacturer number.
        - Mention warranty.
        - Mention shipping information.
        - Mention article number.
        - Mention assembly requirements.
        - Mention brand names unless explicitly requested.
        - Mention dimensions unless they are essential to understanding the product.
        - Invent features, materials, certifications or quality claims.
        - Use exaggerated marketing language.
        - Use phrases such as:
        - Premiumqualität
        - Luxus
        - Exklusiv
        - Hochwertigste Qualität
        - Perfekt für jeden
        - Einzigartig
        - Pflegeleicht
        - Langlebig
        unless clearly supported by the provided data.

        Writing style:

        - Write like a professional furniture catalog.
        - Focus on atmosphere, functionality and design.
        - Describe benefits rather than raw attributes.
        - Avoid generic filler text.
        - Avoid repeating the same idea.
        - Create a coherent text with 2-3 short paragraphs.

        Good example:
        "The harmonische Kombination aus heller Holzoptik und klaren Linien verleiht dem Möbelstück eine zeitlose Ausstrahlung. Es fügt sich mühelos in unterschiedliche Einrichtungsstile ein und schafft eine angenehme Wohnatmosphäre.

        Praktische Stauraummöglichkeiten unterstützen eine aufgeräumte Umgebung und bieten Platz für Gegenstände des täglichen Bedarfs. Die durchdachte Gestaltung verbindet Funktionalität mit einer modernen Optik."

        Return JSON only:
        {
        "description": "..."
        }
        """

        user_prompt = f"""
        PRODUCT:

        {json.dumps(product, ensure_ascii=False)}

        BULLET POINTS:

        {json.dumps(bullet_points, ensure_ascii=False)}
        """

        response = await self.client.responses.create(
            model=self.model,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "description_response",
                    "schema": {
                        "type": "object",
                        "properties": {"description": {"type": "string"}},
                        "required": ["description"],
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

        return data["description"]


async def main():
    from ..core.configs import settings
    from .gpt_helper import GPTHelper

    gpt = GPTHelper(settings.gpt_key)
    desc_gen = DescriptionGenerator(gpt.client)
    return await desc_gen.generate(
        {
            "Artikelbeschreibung": "Stilvoller Nachttisch Schlafzimmer Edelstahl Nachtkonsole Moderne Möbel",
            "Breite": "44 cm",
            "Höhe": "59 cm",
            "Länge": "70 cm",
            "Marke": "JV Möbel",
            "Produktart": "Nachttisch",
            "Farbe": "Weiß",
            "Tischplattenmaterial": "Holz",
            "Material": "Holz",
            "Montage erforderlich": "Ja",
            "Herstellernummer": "JVM4067282760851",
            "Zusätzlich benötigte Teile": "Nein",
            "Stil": "Modern",
            "Anzahl der Schubladen": "2",
            "Zimmer": "Gästezimmer",
            "Holzton": "Helles Holz",
            "Herstellergarantie": "2 Jahre",
            "Muster": "Einfarbig",
            "EAN": "4067282760851",
            "Maße Nachttisch": "ca: 70 x 44 x 59 cm",
        },
        bullet_points=[
            "Made in Europa",
            "Stilvolles, modernes Design setzt elegante Akzente.",
            "Durchdachter Stauraum sorgt für Ordnung im Alltag.",
            "Helles Holzfinish kombiniert mit Weiß sorgt für warme Atmosphäre.",
            "Kompakte Bauweise nutzt Platz effizient, ohne überladen zu wirken.",
        ],
    )


if __name__ == "__main__":
    import asyncio

    res = asyncio.run(main())
    print(res)
