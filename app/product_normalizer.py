import xml.etree.ElementTree as ET

class ProductNormalizer:

    ATTRIBUTES_MAP = {
        "Material": "material",
        "Form": "shape",
        "Farbe": "color",
        "Breite": "width",
        "Höhe": "height",
        "Länge": "length",
        "Abteilung": "department",
        "Montage erforderlich": "assembly required",
        "Zimmer": "room",
        "Herstellergarantie": "manufacturer warranty",
        "Verpackung": "packaging",
        "EAN": "ean",
        "Maße": "dimensions",
    }

    def __init__(self, products: list[dict]):
        self.products = products
        
        
    def payload_deploy(self):
        ...
    

    def extact_XML(self, xml):
        root = ET.fromstring(xml)
        
        return {
            self.mapped(item.find("Name").text): item.find("Value").text
            for item in root.findall("NameValueList")
        }
        
        
    def mapped(self, text: str):
        return self.ATTRIBUTES_MAP.get(text)
    
