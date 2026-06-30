from bs4 import BeautifulSoup as bs

from app.core.logger import logging

logger = logging.getLogger(__name__)


def parse_sku(content: str) -> str | None:
    html = bs(content, "html.parser")
    sku_tag_class = html.find("ft9-cashback-v1")

    sku = sku_tag_class.get("sku") if sku_tag_class else None
    logger.debug("SKU извлечен из HTML: sku=%s found=%s", sku, sku is not None)

    return sku
