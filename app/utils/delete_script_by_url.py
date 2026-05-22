from bs4 import BeautifulSoup as bs


def parse_sku(content: str) -> str | None:
    html = bs(content, "html.parser")
    print(html)
    sku_tag_class = html.find("ft9-cashback-v1")

    sku = sku_tag_class.get("sku") if sku_tag_class else None

    return sku
