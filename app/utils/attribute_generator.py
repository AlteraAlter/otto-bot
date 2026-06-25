import json

from openai import AsyncOpenAI


class AttributeGenerator:
    def __init__(
        self,
        client: AsyncOpenAI,
        model: str = "gpt-5-mini",
    ):
        self.client = client
        self.model = model

    async def generate(
        self,
        *,
        category: str,
        source_attributes: dict,
        bullet_points: list[str],
        otto_attributes: list[dict],
        exclude_attributes: list[dict],
    ) -> dict:

        system_prompt = f"""
        You are an OTTO marketplace attribute mapper.

        Rules:
        - Use only provided information.
        - Never invent values.
        - Return only non empty values
        - Return only attributes requested in OTTO schema.
        - Return valid JSON only.
        - Attribute names must exactly match OTTO attribute names.
        - Return exactly one best value per attribute.
        - Do not return multiple alternatives for one attribute, even for multi value attributes.
        - Numeric attributes must contain only numbers without units.
        - Exlude attributes: {json.dumps(exclude_attributes, ensure_ascii=False)}
        """

        user_prompt = f"""
        CATEGORY:
        {category}

        SOURCE ATTRIBUTES:
        {json.dumps(source_attributes, ensure_ascii=False)}

        BULLET POINTS:
        {json.dumps(bullet_points, ensure_ascii=False)}

        OTTO ATTRIBUTES:
        {json.dumps(otto_attributes, ensure_ascii=False)}
        """

        response = await self.client.responses.create(
            model=self.model,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "attribute_response",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "attributes": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "value": {
                                            "anyOf": [
                                                {"type": "string"},
                                                {"type": "null"},
                                            ]
                                        },
                                    },
                                    "required": ["name", "value"],
                                    "additionalProperties": False,
                                },
                            }
                        },
                        "required": ["attributes"],
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

        return json.loads(response.output_text)


async def main():
    data = json.loads("""
                [
                    {
                        "additionalRequirements": [
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Organic Content Standard 100"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Organic Content Standard 100' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Organic Content Standard 100' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Organic Content Standard 100')",
                            "name": "Lizenznummer Organic Content Standard 100"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Blauer Engel"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Blauer Engel' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Kurzlink Blauer Engel' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Kurzlink Blauer Engel')",
                            "name": "Kurzlink Blauer Engel"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Responsible Down Standard"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Responsible Down Standard' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Responsible Down Standard' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Responsible Down Standard')",
                            "name": "Lizenznummer Responsible Down Standard"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Global Recycled Standard"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Global Recycled Standard' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Global Recycled Standard' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Global Recycled Standard')",
                            "name": "Lizenznummer Global Recycled Standard"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Organic Content Standard blended"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Organic Content Standard blended' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Organic Content Standard blended' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Organic Content Standard blended')",
                            "name": "Lizenznummer Organic Content Standard blended"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "NATURLEDER IVN zertifiziert BEST"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'NATURLEDER IVN zertifiziert BEST' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer NATURLEDER IVN zertifiziert' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer NATURLEDER IVN zertifiziert')",
                            "name": "Lizenznummer NATURLEDER IVN zertifiziert"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Recycled Claim Standard blended"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Recycled Claim Standard blended' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Recycled Claim Standard blended' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Recycled Claim Standard blended')",
                            "name": "Lizenznummer Recycled Claim Standard blended"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Das 'Goldene M'"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Das 'Goldene M'' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Herstellernummer Goldenes M' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Herstellernummer Goldenes M')",
                            "name": "Herstellernummer Goldenes M"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "GOTS organic"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'GOTS organic' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer GOTS organic' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer GOTS organic')",
                            "name": "Lizenznummer GOTS organic"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Grüner Knopf"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Grüner Knopf' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Kurzlink Lizenznehmer Grüner Knopf' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Kurzlink Lizenznehmer Grüner Knopf')",
                            "name": "Kurzlink Lizenznehmer Grüner Knopf"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "GOTS made with organic materials"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'GOTS made with organic materials' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer GOTS made with organic materials' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer GOTS made with organic materials')",
                            "name": "Lizenznummer GOTS made with organic materials"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Recycled Claim Standard 100"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Recycled Claim Standard 100' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Recycled Claim Standard 100' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Recycled Claim Standard 100')",
                            "name": "Lizenznummer Recycled Claim Standard 100"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Global Traceable Down Standard"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Global Traceable Down Standard' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Global Traceable Down Standard' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Global Traceable Down Standard')",
                            "name": "Lizenznummer Global Traceable Down Standard"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "NATURTEXTIL IVN zertifiziert BEST"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'NATURTEXTIL IVN zertifiziert BEST' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer NATURTEXTIL IVN zertifiziert BEST' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer NATURTEXTIL IVN zertifiziert BEST')",
                            "name": "Lizenznummer NATURTEXTIL IVN zertifiziert BEST"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "Responsible Wool Standard"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'Responsible Wool Standard' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Responsible Wool Standard' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Responsible Wool Standard')",
                            "name": "Lizenznummer Responsible Wool Standard"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "GUT-Prodis-Label®"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'GUT-Prodis-Label®' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer GUT-Prodis-Label®' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer GUT-Prodis-Label®')",
                            "name": "Lizenznummer GUT-Prodis-Label®"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "OEKO-TEX® ORGANIC COTTON"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'OEKO-TEX® ORGANIC COTTON' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Produkt ID OEKO-TEX® ORGANIC COTTON' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Produkt ID OEKO-TEX® ORGANIC COTTON')",
                            "name": "Produkt ID OEKO-TEX® ORGANIC COTTON"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "GOTS organic (in Umstellung)"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'GOTS organic (in Umstellung)' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer GOTS organic' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer GOTS organic')",
                            "name": "Lizenznummer GOTS organic"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "GOTS made with organic materials (in Umstellung)"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'GOTS made with organic materials (in Umstellung)' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer GOTS made with organic materials' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer GOTS made with organic materials')",
                            "name": "Lizenznummer GOTS made with organic materials"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "OCS 100 (in Umstellung)"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'OCS 100 (in Umstellung)' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Lizenznummer Organic Content Standard 100' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Lizenznummer Organic Content Standard 100')",
                            "name": "Lizenznummer Organic Content Standard 100"
                        },
                        {
                            "condition": {
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Nachhaltigkeitssiegel')",
                            "name": "Nachhaltigkeitssiegel",
                            "value": "EU-Bio-Logo"
                            },
                            "description": "Wenn das Nachhaltigkeits-Siegel 'EU-Bio-Logo' übermittelt wird, muss auch die vom Siegel Herausgeber vergebene Lizenznummer im Attribut 'Öko-Kontrollnummer' übermittelt werden.",
                            "featureRelevance": [
                            "LICENSE_REQUIRED"
                            ],
                            "jsonPath": "$.productVariations[*].productDescription.attributes(@name='Öko-Kontrollnummer')",
                            "name": "Öko-Kontrollnummer"
                        }
                        ],
                        "   ": [
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "",
                            "exampleValues": [
                            "Brettsitz",
                            "Knopfheftung",
                            "Muldensitz",
                            "Rundsitz",
                            "Sitzkissen"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Details Sitzfläche",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "",
                            "exampleValues": [
                            "Griffstück",
                            "Knopfheftung",
                            "extrahohe Rückenlehne",
                            "gepolstert",
                            "halbhohe Rückenlehne"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Details Rückenlehne",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "",
                            "exampleValues": [
                            "gepolstert",
                            "Softpad"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Details Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Beschreibt die Ausstattung des Produkts",
                            "exampleValues": [
                            "Betonboden",
                            "Fliesenboden",
                            "Laminatboden",
                            "Steinboden",
                            "Teppichboden"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS",
                            "FILTER",
                            "NAVIGATION",
                            "SEARCH"
                            ],
                            "multiValue": true,
                            "name": "Einsatzbereich",
                            "recommendedValues": [
                            "Steinboden",
                            "Laminatboden",
                            "Betonboden",
                            "Fliesenboden",
                            "Teppichboden"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Zusatz zum Produkt-Namen. Beispiel: Modell: 'Stadt', Produkt-Name: 'Hamburg'",
                            "exampleValues": [
                            "2228",
                            "2229",
                            "myHELIOS",
                            "Sessel",
                            "Striker Copilot"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Modell",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "",
                            "exampleValues": [
                            "Armlehnstuhl",
                            "CH-106",
                            "Drehstuhl myTRITON",
                            "Homexperts",
                            "Stuhl"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Herstellermodellbezeichnung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "",
                            "exampleValues": [
                            "Hammel Esstische",
                            "W.SCHILLIG magnus",
                            "W.SCHILLIG gunnar",
                            "Tisch",
                            "Esstisch Alpha Tray von hauck"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Kombinierbar mit",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Wenn erwünscht, geben Sie hier einen kurzen Text (ca. 300 Zeichen) ein, der die Marke Ihres Produktes werblich beschreibt. Beachten Sie: Verwenden Sie pro Marke jeweils den gleichen Text.",
                            "exampleValues": [
                            "connubia ist die junge und zeitgenössische Marke der Calligaris Gruppe, die von dem neuen Konzept von #connubity inspiriert ist, einem wesentlichen Teil der DNA der Marke, die ihren Geist verkörpert und das repräsentiert, wofür sie ihr Sprecher ist: die Schaffung einer neuen Community von Menschen, die durch dieselbe Leidenschaft für frisches und dynamisches Design und schneidige Neuheiten verbunden sind!",
                            "Die Begeisterung der K+W Polstermöbel wird nicht nur durch unsere Produkte bestimmt, sondern auch durch die von Erfindern, Pionieren und Konstrukteuren geprägte Unternehmensgeschichte. Seit der Unternehmungsgründung im Jahr 1799 in Lichtenfels haben wir uns von der ehemaligen Korbmacherei zu einem der führenden Speisezimmer-Hersteller in Europa entwickelt. Seit 2007 sind wir Mitglied der Himolla-Gruppe. Dank eigener Entwicklung, Kreativiät und Leidenschaft sind wir flexibler Partner für unsere Kunden und Trendsetter zugleich. Heute ist K+W mit rund 500 Mitarbeitern an europaweiten Produktions- und Lagerstätten vertreten, darunter am Standort in Mitwitz/Oberfranken. In neuen Trends und Entwicklungen sehen wir Chancen - für das Produkt, die Gesellschaft und dem Kunden. Aus diesem Grund richten wir unsere Strategie stetig auf künftige Herausforderungen aus. Die Nachhaltigkeit wird für viele Menschen zum Ausdruck einer Lebenseinstellung. Als verantwortungsbewusster Möbelhersteller ist K+W mit dem Zertifikat des 'goldenem M' ausgezeichnet, ist Mitglied im Klimapakt der Gütegemeinschaft Möbel, in dem wir uns verpflichten, einen maßgeblichen Beitrag zur Erhaltung unserer Umwelt zu leisten. Neben der Produktqualität wird auch eine umweltschonende Fertigung als oberste Priorität angesehen. Außerdem erfüllt K+W seit einigen Jahren die Anforderungen von EMAS, dem Gütesiegel der Europäpischen Union, weltweit eines der anspruchsvollsten Systeme für nachhaltiges Umweltmanagement.",
                            "Es gibt Entscheidungen im Leben, die wichtiger sind als andere. Meilensteine, die größere Bedeutung für den Alltag erlangen, als man sich zunächst vorstellen kann. Ihr erster Stressless® Bequemsessel kann gut und gerne einer dieser Schlüsselmomente sein, die ein Vorher und ein Nachher definieren. Über die Jahrzehnte hinweg haben alle Stressless® Möbelentwürfe eines gemeinsam gehabt: Diese einzigartige Erfahrung von Komfort.Stressless® Möbel sind bekannt für ihre Funktionen, die besondere Qualität, den außergewöhnlichen Komfort sowie das typisch skandinavische Design. Jetzt ist dieser Sitzkomfort mit Stressless® Dining auch für das Esszimmer erhältlich",
                            "Mayer Sitzmöbel",
                            "Seit 2001 begeistert uns Home affaire mit Landhausmöbeln zum Verlieben. Ob modern, romantisch oder natürlich traditionell – der Fantasie für wunderschönes Einrichten sind kaum Grenzen gesetzt."
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Markeninformationen",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Anzahl Teile",
                            "exampleValues": [
                            "1",
                            "2",
                            "3",
                            "4"
                            ],
                            "featureRelevance": [
                            "TITLE",
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Anzahl Teile",
                            "recommendedValues": [
                            "2",
                            "3",
                            "4"
                            ],
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": "St.",
                            "unitDisplayName": "Stück"
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "",
                            "exampleValues": [
                            "Klettverschluss",
                            "Reißverschluss"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verschluss Auflagen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Bitte beachten Sie die Zeichenbegrenzung von maximal 70 Zeichen für dieses Merkmal.",
                            "exampleValues": [
                            "2er Set",
                            "2 oder 4 Stück",
                            "aus Holz",
                            "Gestell aus Massivholz",
                            "mit Massivholzbeinen"
                            ],
                            "featureRelevance": [
                            "TITLE"
                            ],
                            "multiValue": false,
                            "name": "Besondere Merkmale",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Produkte mit demselben Eintrag in “Serie” und “Marke”, werden unter 'Mehr aus der Serie' angezeigt. Des Weiteren wird der Serienname im Filter “Serie” aufgeführt. Wenn es sich nicht um den offiziellen Seriennamen handelt, kann das Merkmal 'Serie Technischer Name' gepflegt werden, damit die Produkte unter 'Mehr aus der Serie' angezeigt werden.",
                            "exampleValues": [
                            "Academy",
                            "Alpha+",
                            "Findahl by Hammel",
                            "Laurel",
                            "Sitness"
                            ],
                            "featureRelevance": [],
                            "multiValue": false,
                            "name": "Serie",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Set-Typ",
                            "exampleValues": [
                            "Packung",
                            "Set",
                            "Spar-Set"
                            ],
                            "featureRelevance": [
                            "TITLE"
                            ],
                            "multiValue": false,
                            "name": "Set-Typ",
                            "recommendedValues": [
                            "Set",
                            "Packung",
                            "Spar-Set"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Produktdetails",
                            "description": "Relevant für EEK",
                            "exampleValues": [
                            "CBN 4835_999405451",
                            "CNfr 4335-21",
                            "ORB615DOL"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Modellbezeichnung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "Ausstattung",
                            "exampleValues": [
                            "Armlehnen",
                            "Filzgleiter",
                            "Sitzfläche mit abgerundeter Vorderkante",
                            "Sitzhöhe verstellbar",
                            "verstellbare Rückenlehne"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Ausstattung",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "Beschreibt die Funktionen des Produkts",
                            "exampleValues": [
                            "Armlehnenverstellung",
                            "Drehfunktion",
                            "Höhenverstellung",
                            "Neigungswinkelverstellung",
                            "Sitzhöhenverstellung"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Funktionen",
                            "recommendedValues": [
                            "Höhenverstellung"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "Synchronmechanik - gleichzeitige Rückenlehnen- & Sitzflächenneigung",
                            "Permanentmechanik - Neigung der Rückenlehne & Sitzfläche bleibt fest",
                            "Asynchronmechanik - entkoppelte Rückenlehnen- & Sitzflächenneigung"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Bewegungsmechanik",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "Härtegradeinstellung",
                            "auf Körpergewicht einstellbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Einstellung Bewegungsmechanik",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "Breite verstellbar",
                            "abklappbar",
                            "drehbar",
                            "höhenverstellbar",
                            "kippbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verstellbarkeit Sitzfläche",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "2-fach verstellbar",
                            "4-fach verstellbar",
                            "5-fach verstellbar",
                            "stufenlos verstellbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verstellbarkeit Sitzhöhe",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "4-fach verstellbar",
                            "6-fach verstellbar",
                            "manuell",
                            "mechanisch mittels Gasdruckfeder",
                            "stufenlos verstellbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verstellbarkeit Sitztiefe",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "5-fach verstellbar",
                            "höhenverstellbar",
                            "neigungsverstellbar",
                            "stufenlos verstellbar",
                            "wippbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verstellbarkeit Rückenlehne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "Breite verstellbar",
                            "höhenverstellbar",
                            "kippbar",
                            "neigungsverstellbar",
                            "wippbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verstellbarkeit Kopfstütze",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "2D",
                            "3D",
                            "4D",
                            "höhenverstellbar",
                            "manuell"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Verstellbarkeit Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": "",
                            "unitDisplayName": "fach"
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "höhenverstellbar",
                            "kippsicher",
                            "klappbar",
                            "mitwachsend",
                            "stapelbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Eigenschaften",
                            "recommendedValues": [
                            "klappbar",
                            "mitwachsend",
                            "höhenverstellbar"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "1",
                            "2",
                            "3",
                            "4",
                            "5"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Anzahl feststellbarer Rollen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "Anzahl der Teile des Sets/ der Packung",
                            "exampleValues": [
                            "2",
                            "3",
                            "4"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Anzahl Rollen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": "St."
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "4-Fuß-Gestell",
                            "Beine",
                            "Kufengestell",
                            "Rundrohrgestell",
                            "Vierkantgestell"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Art Gestell",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Ausstattung & Funktionen",
                            "description": "",
                            "exampleValues": [
                            "Doppelrollen",
                            "Hartbodenrollen",
                            "Kugellagerrollen",
                            "Sicherheitsdoppelrollen",
                            "Teppichbodenrollen"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Art Rollen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "Breite",
                            "exampleValues": [
                            "45",
                            "46",
                            "57",
                            "58",
                            "60"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Breite",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "44",
                            "46",
                            "47",
                            "56",
                            "60"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Breite zusammengeklappt",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "Tiefe",
                            "exampleValues": [
                            "57",
                            "59",
                            "60",
                            "62",
                            "64"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Tiefe",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "31",
                            "55",
                            "60",
                            "64",
                            "65"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Tiefe zusammengeklappt",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "Höhe",
                            "exampleValues": [
                            "86",
                            "88",
                            "90",
                            "91",
                            "92"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe",
                            "recommendedValues": [
                            "90"
                            ],
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "83",
                            "88",
                            "89",
                            "91",
                            "99"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe maximal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "110",
                            "78",
                            "90",
                            "91",
                            "99"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe zusammengeklappt",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "Gewicht",
                            "exampleValues": [
                            "10",
                            "12",
                            "6",
                            "7",
                            "8"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Gewicht",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "kg",
                            "unitDisplayName": "Kilogramm"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "43",
                            "45",
                            "46",
                            "47",
                            "50"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzbreite",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "47",
                            "46",
                            "45",
                            "48",
                            "42"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzbreite vorne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "42",
                            "40",
                            "43",
                            "39",
                            "33"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzbreite hinten",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "42",
                            "43",
                            "44",
                            "45",
                            "46"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitztiefe",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "46",
                            "44",
                            "49",
                            "45",
                            "48"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitztiefe maximal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "43",
                            "44",
                            "45",
                            "47",
                            "48"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzhöhe",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "53",
                            "55",
                            "56",
                            "57",
                            "58"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzhöhe maximal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "44",
                            "46",
                            "47",
                            "50"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzhöhe minimal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "45",
                            "46",
                            "44",
                            "38",
                            "43"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Sitzhöhe ohne Kissen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "100",
                            "110",
                            "120",
                            "130",
                            "150"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Belastbarkeit maximal",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "FLOAT",
                            "unit": "kg",
                            "unitDisplayName": "Kilogramm"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "43",
                            "46",
                            "47",
                            "55",
                            "57"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Breite Rückenlehne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "38",
                            "40",
                            "41",
                            "43",
                            "46"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe Rückenlehne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "42",
                            "46",
                            "48",
                            "62",
                            "81"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe Rückenlehne maximal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "10",
                            "4",
                            "5",
                            "6",
                            "60"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Breite Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "19",
                            "64",
                            "65",
                            "66",
                            "67"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "65",
                            "66",
                            "68",
                            "69",
                            "72"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Höhe Armlehnen maximal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "cm",
                            "unitDisplayName": "Zentimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "Alle Angaben sind ca.-Maße."
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Hinweis Maßangaben",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "0,9",
                            "1,1",
                            "1,3",
                            "1,5"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Lederstärke",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "mm",
                            "unitDisplayName": "Millimeter"
                        },
                        {
                            "attributeGroup": "Maßangaben",
                            "description": "",
                            "exampleValues": [
                            "110",
                            "20",
                            "4",
                            "50",
                            "6"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Stärke Auflagen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "mm",
                            "unitDisplayName": "Millimeter"
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Kunstleder",
                            "Microfaser",
                            "Webstoff"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS",
                            "FILTER",
                            "NAVIGATION",
                            "SEARCH"
                            ],
                            "multiValue": false,
                            "name": "Bezug",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Kunstleder",
                            "Microfaser",
                            "Polyester",
                            "Stoffbezug",
                            "Struktur (recyceltes Polyester)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Bezug Sitzfläche",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Kunstleder",
                            "Microfaser",
                            "Polyester",
                            "Samtvelours",
                            "Webstoff"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Bezug Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Anilinleder",
                            "Dickleder",
                            "Glattleder",
                            "Long-Life-Leder",
                            "Nappaleder"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Lederart",
                            "recommendedValues": [
                            "Glattleder",
                            "Nappaleder"
                            ],
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "100000",
                            "30000",
                            "35000",
                            "40000",
                            "45000"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Scheuerbeständigkeit Bezug",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": "Scheuertouren",
                            "unitDisplayName": "Scheuertouren"
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "3 (durchschnittlich)",
                            "3-4 (durchschnittlich bis gering)",
                            "4 (gering)",
                            "4-5 (gering bis sehr gering)",
                            "5 (sehr gering)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Pillingbildung Bezug",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "Farbbeständigkeit: Ob der Bezug in nassem und trockenem Zustand abfärbt oder Abfärbungen aufnimmt.",
                            "exampleValues": [
                            "1 (sehr gering)",
                            "2 (mäßig)",
                            "3 (ziemlich gut)",
                            "4 (gut)",
                            "5 (sehr gut)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Abriebfestigkeit Bezug",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "Material",
                            "exampleValues": [
                            "Kunstleder",
                            "Kunststoff",
                            "Massivholz",
                            "Polyester",
                            "Stoff"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS",
                            "FILTER",
                            "NAVIGATION",
                            "SEARCH"
                            ],
                            "multiValue": false,
                            "name": "Material",
                            "recommendedValues": [
                            "Massivholz"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Kunstleder",
                            "Kunststoff",
                            "Massivholz",
                            "Polyester",
                            "Stoff"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Material Sitzfläche",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Kunstleder",
                            "Microfaser",
                            "Polyester",
                            "Stoffbezug",
                            "Webstoff"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Bezug Rückenlehne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Kunstleder",
                            "Kunststoff",
                            "Leder",
                            "Massivholz",
                            "Polyester"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Material Rückenlehne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Aluminium",
                            "Kunststoff",
                            "Massivholz",
                            "Metall",
                            "Polyester"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Material Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Aluminium",
                            "Edelstahl",
                            "Kunststoff",
                            "Metall"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Material Gestell",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Metall",
                            "Kunststoff",
                            "Aluminium",
                            "Massivholz",
                            "Nylon"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Material Fußkreuz",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "ABS-Kunststoff",
                            "Geflecht Weide",
                            "Kunststoff",
                            "Metall",
                            "WPC (Holz-Kunststoff-Komposit)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Material Rollen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Das Label des FSC® weist nach, dass Sie mit dem Kauf dieser Produkte vorbildliche Waldwirtschaft - nach den strengen ökologischen, sozialen und wirtschaftlichen Standards des Forest Stewardship Council® - fördern und die Waldressourcen schonen.",
                            "Rückseite Originalbezugsqualität",
                            "enthält nichttextile Teile tierischen Ursprungs"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Materialhinweis",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "atmungsaktiv",
                            "lichtbeständig",
                            "strapazierfähig",
                            "wasserabweisend",
                            "witterungsbeständig"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Materialeigenschaften",
                            "recommendedValues": [
                            "wasserabweisend",
                            "atmungsaktiv"
                            ],
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "3 (mäßig)",
                            "4 (ziemlich gut)",
                            "5 (gut)",
                            "6 (sehr gut)",
                            "7 (vorzüglich)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Lichtbeständigkeit Bezug",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "Zusammensetzung der verschiedenen Materialien eines textilen Produktes auf Basis des Textilkennzeichnungsgesetzes. Die Angaben müssen mit denen am Produkt übereinstimmen.",
                            "exampleValues": [
                            "95% Baumwolle, 5% Elasthan",
                            "Bezug: 100% Baumwolle. Füllung: 100% Baumwolle",
                            "Bezug: 100% Baumwolle. Füllung: 100% Gänsedaunen",
                            "Obermaterial: 100% Baumwolle",
                            "Obermaterial: 80% Schurwolle, 20% Polyamid"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Materialzusammensetzung",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Buche",
                            "Eiche",
                            "Esche",
                            "Eukalyptus",
                            "Teak"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Holzart",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "Eucalyptus grandis",
                            "Fagus sylvatica",
                            "Juglans regia",
                            "Pinus sylvestris",
                            "Quercus robur"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Holzart (botanisch)",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "China",
                            "Deutschland",
                            "Indien",
                            "Italien",
                            "Kroatien"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Herkunftsland Holz",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Material",
                            "description": "",
                            "exampleValues": [
                            "100% Polyester",
                            "100 % Polyester",
                            "Leder BATICK: BATICK ist ein leicht korrigiertes, durchgefärbtes und genarbtes Möbelleder, bei dem die meisten Unebenheiten und Spuren in der Regel entfernt wurden.",
                            "Leder PALOMA: PALOMA ist ein durchgefärbtes Semianilin-Möbelleder mit natürlicher Narbung.",
                            "ROHLEDER Stoff Q2 FARON: Ein fester zuverlässiger Bouclé mit einem strukturierten Aussehen und einer komfortablen Oberfläche (100% Polyester im Flor, Grundgewebe: 50% Polyester, 50% Polyacryl)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Information Materialzusammensetzung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "anthrazit",
                            "grau",
                            "Grau",
                            "schwarz",
                            "Schwarz"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Farbe Sitzfläche",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "Anthrazit",
                            "grau",
                            "Grau",
                            "schwarz",
                            "Schwarz"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Farbe Rückenlehne",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "grau",
                            "natur",
                            "schwarz",
                            "silber",
                            "weiß"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Farbe Gestell",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "schwarz",
                            "Anthrazit",
                            "grau",
                            "Cappuccino",
                            "Olive"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Farbe Keder",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "anthrazit",
                            "braun",
                            "grau",
                            "schwarz",
                            "Schwarz"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Farbe Armlehnen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "schwarz",
                            "Schwarz",
                            "matt schwarz",
                            "silber",
                            "Silber"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Farbe Fußkreuz",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "schwarz",
                            "Schwarz",
                            "Blau",
                            "grau",
                            "Kirschrot"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Farbe Rollen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "Bitte beachten Sie, dass bei Online-Bildern der Artikel die Farben auf dem heimischen Monitor von den Originalfarbtönen abweichen können.",
                            "Bitte beachten Sie,dass die Farben auf Ihrem Monitor von den Originalfarbtönen abweichen können.",
                            "Bitte beachten Sie, dass die Farben auf Ihrem Monitor von den Originalfarbtönen abweichen können.",
                            "Bitte beachten Sie,dass die Farben auf Ihrem Monitor von den Originalfarbtönen abweichen können.' für das Attribut",
                            "Da Rattan ein Naturmaterial ist, kann es zu Farbabweichungen kommen."
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Farbhinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "Farbe",
                            "exampleValues": [
                            "anthrazit",
                            "braun",
                            "grau",
                            "schwarz",
                            "weiß"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS",
                            "FILTER",
                            "NAVIGATION",
                            "SEARCH"
                            ],
                            "multiValue": false,
                            "name": "Farbe",
                            "recommendedValues": [
                            "weiß"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Farbe",
                            "description": "",
                            "exampleValues": [
                            "Anthrazit",
                            "beige",
                            "grau",
                            "schwarz",
                            "taupe"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Farbe Auflagen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "beige",
                            "blau",
                            "braun",
                            "bunt",
                            "gelb",
                            "goldfarben",
                            "grau",
                            "grün",
                            "lila",
                            "natur",
                            "orange",
                            "rosa",
                            "rot",
                            "schwarz",
                            "silberfarben",
                            "transparent",
                            "weiß"
                            ],
                            "attributeGroup": "Farbe",
                            "description": "Grundfarbe",
                            "featureRelevance": [
                            "FILTER",
                            "NAVIGATION",
                            "SEARCH"
                            ],
                            "multiValue": false,
                            "name": "Grundfarbe",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "Dänisch",
                            "Erste eigene Wohnung",
                            "Klassik",
                            "modern",
                            "Modern"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Design",
                            "recommendedValues": [
                            "modern",
                            "Dänisch",
                            "Modern"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "Baustellen-Fahrzeug",
                            "Blumen",
                            "Leopardfellmuster",
                            "Prinzessinnen",
                            "Raute"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Motiv",
                            "recommendedValues": [
                            "Baustellen-Fahrzeug",
                            "Prinzessinnen",
                            "Blumen",
                            "Raute"
                            ],
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "gebürstet",
                            "gefräst",
                            "geriffelt",
                            "geschliffen",
                            "poliert"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Oberflächenbearbeitung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "antikisiert",
                            "gebeizt",
                            "geölt",
                            "lackiert",
                            "naturbelassen"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Oberflächenbehandlung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "furniert",
                            "melaminbeschichtet",
                            "melaminharzbeschichtet",
                            "pulverbeschichtet",
                            "verzinkt"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Oberflächenbeschichtung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "glänzend",
                            "hochglänzend",
                            "matt",
                            "seidenglänzend",
                            "seidenmatt"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Oberflächenoptik",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Optik/Stil",
                            "description": "",
                            "exampleValues": [
                            "Lederoptik",
                            "meliert",
                            "Samtoptik",
                            "Strukturoptik",
                            "uni"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Optik Bezug",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Allgemein",
                            "description": "",
                            "exampleValues": [
                            "Kunststoff-Fußkreuz schwarz",
                            "Set",
                            "Synchronmechanik mit selbstregulierender Gewichtseinstellung und Sitztiefenverstellung",
                            "Teppichbodenrollen",
                            "Vintage Anthrazit"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME"
                            ],
                            "multiValue": false,
                            "name": "Ausführung",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Allgemein",
                            "description": "",
                            "exampleValues": [
                            "Arbeitszimmer",
                            "Esszimmer",
                            "Flur",
                            "Schlafzimmer",
                            "Wohnzimmer"
                            ],
                            "featureRelevance": [
                            "FILTER",
                            "NAVIGATION",
                            "SEARCH"
                            ],
                            "multiValue": true,
                            "name": "Wohnraum",
                            "recommendedValues": [
                            "Flur",
                            "Schlafzimmer",
                            "Arbeitszimmer",
                            "Wohnzimmer",
                            "Esszimmer"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Allgemein",
                            "description": "",
                            "exampleValues": [
                            "Industrial",
                            "Klassik",
                            "Landhaus",
                            "Modern",
                            "Scandi"
                            ],
                            "featureRelevance": [],
                            "multiValue": true,
                            "name": "Wohnstil",
                            "recommendedValues": [
                            "Scandi",
                            "Industrial",
                            "Klassik",
                            "Landhaus",
                            "Modern"
                            ],
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "Babys",
                            "Jugendliche",
                            "Kinder",
                            "Erwachsene"
                            ],
                            "attributeGroup": "Allgemein",
                            "description": "Zielgruppe",
                            "featureRelevance": [],
                            "multiValue": true,
                            "name": "Zielgruppe",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Lieferung & Montage",
                            "description": "",
                            "exampleValues": [
                            "Aufbauanleitung",
                            "Filzgleiter",
                            "Kunststoffgleiter",
                            "Montagematerial",
                            "Rollen"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Lieferumfang",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Lieferung & Montage",
                            "description": "",
                            "exampleValues": [
                            "montiert",
                            "teilmontiert",
                            "teilmontiert, nur Füße zu montieren",
                            "vormontiert",
                            "zerlegt"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Lieferzustand",
                            "reference": "",
                            "relevance": "MEDIUM",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Lieferung & Montage",
                            "description": "",
                            "exampleValues": [
                            "einfache Selbstmontage mit Aufbauanleitung",
                            "fertigmontiert",
                            "inklusive Aufbauanleitung - eine zweite Person zum Aufbau wird empfohlen",
                            "Inklusive Aufbau – und Premiumservice",
                            "teilmontiert"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Aufbauhinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Wählen Sie einen oder mehrere Warnhinweise aus der Liste aus, die in gleicher Form auch am Produkt angebracht sind (häufig bei Spielwaren zu finden).",
                            "exampleValues": [
                            "Benutzen Sie diesen Stuhl nicht, bevor nicht alle Schrauben, Hebel und Verbindungen korrekt montiert wurden.",
                            "Benutzen Sie diesen Stuhl nur mit einer Person.",
                            "Falls Teile fehlen, gebrochen oder beschädigt sind, benutzen Sie diesen Stuhl nicht mehr, bis er mit Originalteilen repariert wurde.",
                            "Prüfen Sie mindestens alle drei Monate, ob alle Schrauben, Hebel und Verbindungen korrekt sitzen.",
                            "Stehen Sie nicht auf diesem Stuhl, benutzen Sie ihn nicht als Leiter."
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Warnhinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Pflegehinweise",
                            "exampleValues": [
                            "Bitte beachten Sie die Pflegehinweise gemäß dem beiliegenden Produkt- und Materialpass.",
                            "feucht abwischbar",
                            "pflegeleicht",
                            "trocken abwischbar"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Pflegehinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "",
                            "exampleValues": [
                            "abbürsten",
                            "absaugen",
                            "abstaubbar",
                            "abwischbar",
                            "pflegeleicht"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Pflegehinweise Bezug",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Geben sie bitte an, ob sich Akkus oder Batteries im Gerät oder in der Verpackung befinden bzw. diese festverbaut sind.",
                            "exampleValues": [
                            "Akku im Produkt eingebaut",
                            "Akku/s bei Lieferung nicht geladen",
                            "Akkus im Produkt eingebaut",
                            "Batterie im Produkt eingebaut",
                            "Batterien im Produkt eingebaut"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Lieferzustand Batterien / Akkus",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Hinweise",
                            "exampleValues": [
                            "Lieferung ohne Dekoration.",
                            "Zur allgemeinen Pflege reicht es, wenn Sie die Oberfläche mit einer weichen Kleiderbürste ab und zu leicht abbürsten oder mit der Polsterdüse absauge"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Hinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "GS-Zeichen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Falls Ihr Artikel zu einer Serie gehört, können Sie hier Hinweise zu dieser Serie angeben. Beispiel: 'Die Serie »ELEMENTS« besteht aus frei kombinierbaren Elementen….'",
                            "exampleValues": [
                            "Bergamo",
                            "KENSINGTON TWIST LOCK",
                            "Passend zur KONIFERA Garten-Essgruppe »Nizza«",
                            "SAVIK CORNWALL",
                            "SAVIK NORFOLK"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Serienhinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "",
                            "exampleValues": [
                            "Das 'Goldene M', Gütesiegel der DGM"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Qualitätssiegel",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Hinweis zur Daten Nutzung und Weitergabe an Dritte und Möglichkeit der Einsicht",
                            "exampleValues": [],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Informationen zur Datennutzung (nach EU Data Act)",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Hinweise zur Anlieferung",
                            "exampleValues": [
                            "Anlieferung ausschließlich mit 40t LKW (außer Zubehör) nach vorheriger telefonischer Avisierung",
                            "Anlieferung erfolgt mit 40-Tonnen LKW",
                            "Lieferung frei Bordsteinkante",
                            "Lieferung im Pappkarton"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Lieferhinweise",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "3 Jahre auf die Beschichtung",
                            "3 Jahre nach Registrierung über die Website"
                            ],
                            "attributeGroup": "Hinweise",
                            "description": "Garantien auf Teilbereiche des Produktes oder unter bestimmten Bedingungen",
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Bedingte Herstellergarantie",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "0,25",
                            "0,5",
                            "0,75",
                            "1",
                            "1,5",
                            "10",
                            "11",
                            "12",
                            "13",
                            "14",
                            "15",
                            "16",
                            "17",
                            "18",
                            "19",
                            "2",
                            "2,5",
                            "20",
                            "21",
                            "22",
                            "23",
                            "24",
                            "25",
                            "26",
                            "27",
                            "28",
                            "29",
                            "3",
                            "30",
                            "4",
                            "5",
                            "6",
                            "7",
                            "8",
                            "9"
                            ],
                            "attributeGroup": "Hinweise",
                            "description": "Gültig für das gesamte Produkt, nicht Teilbereiche oder unter bestimmten Bedingungen",
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Herstellergarantie Gesamtprodukt",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "Jahr(e)"
                        },
                        {
                            "attributeGroup": "Hinweise",
                            "description": "Wählen Sie hier aus der Liste der möglichen Sprachen diejenigen aus, in der eine Bedienungs-/Aufbauanleitung vorliegt.",
                            "exampleValues": [
                            "Deutsch (DE)",
                            "Englisch (EN)",
                            "Französisch (FR)",
                            "Italienisch (IT)",
                            "Türkisch (TR)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Sprachen Bedienungs-/Aufbauanleitung",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Wissenswertes",
                            "description": "",
                            "exampleValues": [
                            "100% Polyester",
                            "Lieferung frei Bordsteinkante",
                            "Pflegehinweise für naturbelassene/gelackte Möbel aus Naturholz: Die Oberfläche lässt sich am besten mit einem mäßig feuchten Tuch säubern. Achtung: Lösungsmittelhaltige Reinigungsmittel oder Politur darf nicht verwendet werden.",
                            "Wippmechanik mit Härtegradeinstellung zur Einstellung des Wippverhaltens",
                            "Wir produzieren seit über 130 Jahren auf höchster Qualitätsstufe in unserem Werk in Mannsgereuth (Bayern)."
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Wissenswertes",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Wissenswertes",
                            "description": "",
                            "exampleValues": [
                            "6",
                            "8"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Empfehlung tägliche Nutzungsdauer maximal",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": "Std.",
                            "unitDisplayName": "Stunden"
                        },
                        {
                            "attributeGroup": "Wissenswertes",
                            "description": "",
                            "exampleValues": [
                            "10 Jahre gemäß den Garantie-Bedingungen",
                            "2 Jahre gemäß den Garantie-Bedingungen",
                            "5 Jahre gemäß den Garantie-Bedingungen",
                            "6 Jahre gemäß den Garantie-Bedingungen",
                            "9 Jahre gemäß den Garantie-Bedingungen"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Herstellergarantie",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Wissenswertes",
                            "description": "",
                            "exampleValues": [
                            "Made in Austria",
                            "Made in Denmark",
                            "Made in Europe",
                            "Made in Italy",
                            "Made in Norway"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Herstellungsland",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Bezug",
                            "description": "",
                            "exampleValues": [
                            "Polyester",
                            "Baumwolle",
                            "Polyurethan",
                            "Nylon",
                            "Viskose"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Material Auflagen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "Die Bauart der Akkus und ihre chemische Zusammensetzung sind wichtige Informationen in der Logistik für Gefahrstoffe. Auch als Kundeninformation wichtig.",
                            "exampleValues": [
                            "1,5-V-Lady (HR1/N)",
                            "4,5-V-Flachbatterie (3LR12)",
                            "6-V-2CR5",
                            "6-V-Flatpack (J)",
                            "Nickel-Metallhydrid (NiMH)"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Batterie-/Akku-Technologie",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "Bitte die Stückzahl der verbauten oder beigelegten Batterien eintragen. Diese Angabe wird für die Gefahrstoff-Logistik und zur Kundeninformation benötigt.",
                            "exampleValues": [
                            "1",
                            "2",
                            "3",
                            "4",
                            "5"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Anzahl Batterien",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": "St.",
                            "unitDisplayName": "Stück"
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "Bitte die Stückzahl der verbauten oder beigelegten Batterien eintragen. Diese Angabe wird für die Gefahrstoff-Logistik und zur Kundeninformation benötigt.",
                            "exampleValues": [
                            "1"
                            ],
                            "featureRelevance": [
                            "VARIATION_THEME",
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Anzahl Akkus",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": "St.",
                            "unitDisplayName": "Stück"
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "Die Kapazität der verbauten Akkus wird nicht nur zur Information der Kunden benötigt, sondern ist auch in der Logistik von Gefahrstoffen (dazu gehören auch Akkus) eine wichtige Information.",
                            "exampleValues": [
                            "0"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Akkukapazität",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "mAh",
                            "unitDisplayName": "Milliamperestunde"
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "Spannung des Akkus in Volt. Relevant als Kundeninformation. Beachten Sie: Wird das Merkmal „Spannung Akku“ gewählt, muss auch die „Leistung Akku“ angegeben werden. Hierdurch ist eine Berechnung der Akkukapazität möglich.",
                            "exampleValues": [
                            "36.0",
                            "48.0",
                            "60.0",
                            "72.0",
                            "64.0"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Spannung Akku",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "V",
                            "unitDisplayName": "Volt"
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "Leistung des Akkus, Information für Kunden. Siehe auch Merkmal 'Spannung Akku'.",
                            "exampleValues": [
                            "12.0",
                            "1440.0",
                            "20000.0",
                            "2100.0",
                            "26"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Leistung Akku",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "FLOAT",
                            "unit": "Wh",
                            "unitDisplayName": "Wattstunde"
                        },
                        {
                            "attributeGroup": "Stromversorgung",
                            "description": "",
                            "exampleValues": [
                            "Akku (fest eingebaut)",
                            "Akku (wechselbar)",
                            "Batteriebetrieb",
                            "externes Netzteil",
                            "internes Netzteil"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Art Stromversorgung",
                            "recommendedValues": [
                            "externes Netzteil",
                            "Batteriebetrieb",
                            "internes Netzteil"
                            ],
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Technische Daten",
                            "description": "WEEE (Waste of Electrical and Electronic Equipment) erforderlich bei ElektroG-relevanten Produkten (Gesetz über das Inverkehrbringen, die Rücknahme und die umweltverträgliche Entsorgung von Elektro- und Elektronikgeräten)",
                            "exampleValues": [
                            "44938294",
                            "58337660",
                            "66451927",
                            "78846991",
                            "85557369"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "WEEE-Reg.-Nr. DE",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Technische Daten",
                            "description": "",
                            "exampleValues": [
                            "DIN EN 12790",
                            "DIN EN 14988"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": true,
                            "name": "Normen",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "Die Nutzung des BLAUER ENGEL Logos ist nur in Verbindung mit einem Kurzlink zulässig, der die BLAUER ENGEL Internetadresse und die Nummer der Vergabekriterien (UZ-Nummer) anzeigt.",
                            "exampleValues": [],
                            "multiValue": false,
                            "name": "Kurzlink Blauer Engel",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Global Recycled Standard",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer GOTS made with organic materials",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer GOTS organic",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer NATURLEDER IVN zertifiziert",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer NATURTEXTIL IVN zertifiziert BEST",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Organic Content Standard 100",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Organic Content Standard blended",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Recycled Claim Standard 100",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Recycled Claim Standard blended",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [
                            "Massivholz"
                            ],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Responsible Down Standard",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "",
                            "exampleValues": [],
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": false,
                            "name": "Lizenznummer Responsible Wool Standard",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "BDIH-Kontrollierte Naturkosmetik",
                            "Bio-Baumwolle",
                            "Bio-Baumwolle in Umstellung",
                            "Bioland",
                            "Blauer Engel",
                            "bluesign® PRODUCT",
                            "CertiPUR",
                            "circular.fashion Designkriterien",
                            "Cotton made in Africa INSIDE",
                            "Cradle to Cradle Certified™ BRONZE",
                            "Cradle to Cradle Certified™ GOLD",
                            "Cradle to Cradle Certified™ PLATINUM",
                            "Cradle to Cradle Certified™ SILVER",
                            "Daunen/Federn aus artgerechter Tierhaltung",
                            "Downpass",
                            "ECOCERT",
                            "EU-Bio-Logo",
                            "EU Ecolabel",
                            "Fairtrade Cotton",
                            "Global Recycled Standard",
                            "GoodWeave™",
                            "GOTS made with organic materials",
                            "GOTS made with organic materials (in Umstellung)",
                            "GOTS organic",
                            "GOTS organic (in Umstellung)",
                            "Grüner Knopf",
                            "GUT-Prodis-Label®",
                            "Leather Working Group",
                            "LENZING™ ECOVERO™",
                            "MADE IN GREEN by OEKO-TEX®",
                            "NATRUE",
                            "Naturland",
                            "NATURLEDER IVN zertifiziert BEST",
                            "NATURTEXTIL IVN zertifiziert BEST",
                            "Nordic Swan Ecolabel",
                            "OCS 100 (in Umstellung)",
                            "OCS blended (in Umstellung)",
                            "OEKO-TEX® ORGANIC COTTON",
                            "Organic Content Standard 100",
                            "Organic Content Standard blended",
                            "Recycelter Kunststoff (Hartwaren)",
                            "Recyceltes Material",
                            "Recycled Claim Standard 100",
                            "Recycled Claim Standard blended",
                            "Regenerativ angebaute Materialien",
                            "Regenerative Cotton Standard®",
                            "Responsible Down Standard",
                            "Responsible Wool Standard",
                            "Schnell nachwachsende Rohstoffe",
                            "Spinnova",
                            "TENCEL™ Lyocell",
                            "TENCEL™ Modal",
                            "TENCEL™ x REFIBRA™ Technologie",
                            "The Good Cashmere Standard®",
                            "Unterstützt Cotton made in Africa",
                            "Viskose aus verbesserter Rohstoffbeschaffung",
                            "Wolle aus artgerechter Tierhaltung"
                            ],
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "Die Anzeige der Siegel auf Otto.de erfolgt erst nach erfolgreicher Validierung der Zertifizierung. Alle Informationen dazu finden Sie im Helpdesk.",
                            "featureRelevance": [
                            "SUSTAINABILITY"
                            ],
                            "multiValue": true,
                            "name": "Nachhaltigkeitssiegel",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Nachhaltigkeit",
                            "description": "Dieses Merkmal darf von Otto Lieferanten nicht gepflegt werden!",
                            "exampleValues": [
                            "12.0.12345"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "OEKO-TEX® Standard 100 Zertifikatsnummer",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "Elektrofahrzeugbatterie",
                            "Gerätebatterie",
                            "Industriebatterie",
                            "LV-Batterie",
                            "Produkt fällt nicht unter die BattVO.",
                            "Starterbatterie"
                            ],
                            "attributeGroup": "Product Compliance",
                            "description": "Art der Batterie nach Batterieverordnung 2023",
                            "multiValue": false,
                            "name": "Batterieart laut BattVO",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Product Compliance",
                            "description": "EAR-Registrierungsnummer zur BattVO",
                            "exampleValues": [
                            "12345678"
                            ],
                            "multiValue": false,
                            "name": "Batt-Reg.-Nr. DE",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "INTEGER",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "Wärmeüberträger für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Große Photovoltaikmodule für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Kleine Photovoltaikmodule für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Großgeräte für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Bildschirmgeräte für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Großgeräte, die in privaten Haushalten genutzt werden können.",
                            "Kleingeräte, die in privaten Haushalten genutzt werden können.",
                            "Kleine Photovoltaikmodule, die in privaten Haushalten genutzt werden können.",
                            "Lampen, außer Gasentladungslampen, die in privaten Haushalten genutzt werden können.",
                            "Wärmeüberträger, die in privaten Haushalten genutzt werden können.",
                            "Produkt fällt nicht unter das ElektroG.",
                            "Kleingeräte für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Gasentladungslampen, die in privaten Haushalten genutzt werden können.",
                            "Große Photovoltaikmodule, die in privaten Haushalten genutzt werden können.",
                            "Kleine Geräte der Informations- und Telekommunikationstechnik, die in privaten Haushalten genutzt werden können.",
                            "Kleine Geräte der Informations- und Telekommunikationstechnik für die ausschließliche Nutzung in anderen als privaten Haushalten.",
                            "Bildschirmgeräte, die in privaten Haushalten genutzt werden können.",
                            "Lampen für die ausschließliche Nutzung in anderen als privaten Haushalten."
                            ],
                            "attributeGroup": "Product Compliance",
                            "description": "ElektroG (Elektro- und Elektronikgerätegesetz): Gesetz über das Inverkehrbringen, die Rücknahme und die umweltverträgliche Entsorgung von Elektro- und Elektronikgeräten",
                            "multiValue": false,
                            "name": "Geräteart laut ElektroG",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Product Compliance",
                            "description": "Abweichender Markenname in der EAR-Datenbank",
                            "exampleValues": [],
                            "multiValue": false,
                            "name": "Marke laut BattVO",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Product Compliance",
                            "description": "Abweichender Markenname in der EAR-Datenbank",
                            "exampleValues": [
                            "ASUS",
                            "babyGO",
                            "Cougar",
                            "Duo Collection",
                            "MSI"
                            ],
                            "multiValue": false,
                            "name": "Marke laut ElektroG (EAR)",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "allowedValues": [
                            "Produkt fällt nicht unter die Gefahrgutvorschriften.",
                            "Produkt fällt unter die Gefahrgutvorschriften."
                            ],
                            "attributeGroup": "Product Compliance",
                            "description": "Mit diesem Merkmal soll eine generelle Aussage getroffen werden, ob der Artikel unter die Gefahrgutvorschriften fällt oder nicht.",
                            "multiValue": false,
                            "name": "Relevanz Gefahrgut",
                            "reference": "",
                            "relevance": "LOW",
                            "type": "STRING",
                            "unit": ""
                        },
                        {
                            "attributeGroup": "Product Compliance",
                            "description": "Wählen Sie den am Produkt verwendeten Netzstecker aus der Liste aus. Diese Information wird zur Einsatzsteuerung und Kundeninformation verwendet.",
                            "exampleValues": [
                            "Euroflachstecker (Typ C-CEE 7/16)",
                            "Konturenstecker (Typ C-CEE 7/17)",
                            "Schutzkontaktstecker (Typ EF-CEE 7/7)",
                            "Schutzkontaktstecker (Typ F-CEE 7/4)",
                            "kein Netzanschluss vorhanden"
                            ],
                            "featureRelevance": [
                            "PRODUCT_DETAILS"
                            ],
                            "multiValue": false,
                            "name": "Typ Netzstecker",
                            "reference": "",
                            "relevance": "HIGH",
                            "type": "STRING",
                            "unit": ""
                        }
                        ],
                        "categories": [
                        "Faltstuhl",
                        "Gaming Chair",
                        "Gartenstuhl",
                        "Kufenstuhl",
                        "Chefsessel",
                        "Hochstuhl",
                        "Stapelstuhl",
                        "Stehhilfe",
                        "4-Fußstuhl",
                        "Regiestuhl",
                        "Polsterstuhl",
                        "Holzstuhl",
                        "Schalenstuhl",
                        "Schreibtischstuhl",
                        "Stuhl",
                        "Kinderklappstuhl",
                        "Klappstuhl",
                        "Schaukelstuhl",
                        "Bistrostuhl",
                        "Drehstuhl",
                        "Besucherstuhl",
                        "Reisehochstuhl",
                        "Angelstuhl",
                        "Gaming-Stuhl",
                        "Esszimmerstuhl",
                        "Freischwinger",
                        "Rattanstuhl",
                        "Armlehnstuhl",
                        "Bürostuhl",
                        "Kombihochstuhl",
                        "Hochlehner",
                        "Küchenstuhl",
                        "Campingstuhl",
                        "Kinderstuhl"
                        ],
                        "categoryGroup": "Stühle",
                        "createdAt": "2022-06-09T12:14:53.277000+00:00",
                        "lastModified": "2026-05-01T02:41:27.534000+00:00",
                        "title": "{brand} {category} {productLine} ({Set-Typ}, [{Anzahl Teile} St.]), {Besondere Merkmale}",
                        "variationThemes": [
                        "Höhe maximal",
                        "Oberflächenbeschichtung",
                        "Oberflächenbehandlung",
                        "Anzahl Akkus",
                        "Holzart",
                        "Anzahl Batterien",
                        "Farbe",
                        "Optik Bezug",
                        "Farbe Sitzfläche",
                        "Ausführung",
                        "Bezug",
                        "Farbe Gestell",
                        "Funktionen",
                        "Anzahl Teile",
                        "Höhe",
                        "Anzahl Rollen",
                        "Material",
                        "Motiv",
                        "Oberflächenoptik",
                        "Belastbarkeit maximal",
                        "Tiefe",
                        "Breite",
                        "Material Gestell",
                        "Oberflächenbearbeitung"
                        ]
                    }
                ]
                """)
    pr = {
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
    }

    pm = ProductMapper([], "")
    gpt = GPTHelper(settings.gpt_key)
    ag = AttributeGenerator(gpt.client)
    res = await ag.generate(
        category="Esszimmerstuhl",
        source_attributes=pr,
        bullet_points=[
            "Zeitlose Eleganz in Schwarz passt zu vielen Einrichtungsstilen",
            "Stabiles Holzgestell sorgt für sicheren Halt beim Sitzen",
            "Bequemer Sitzkomfort dank weichem Stoffbezug",
            "Vielseitig kombinierbar zu vielen Stilrichtungen",
        ],
        otto_attributes=pm.prepare_attrs(data),
        exclude_attributes=pm.direct_map_attrs(pr),
    )
    return res


if __name__ == "__main__":
    import asyncio
    import json

    from ..core.configs import settings
    from ..mapper.product_mapper import ProductMapper
    from .gpt_helper import GPTHelper

    res = asyncio.run(main())

    print(res)
