import httpx
from playwright.async_api import async_playwright
from playwright_stealth.stealth import Stealth

from app.core.logger import logging
from app.schemas.product_response import UrlProcessResult
from app.utils.delete_script_by_url import parse_sku

logger = logging.getLogger(__name__)


class UtilityService:
    async def _fetch_page_html(self, url: str):
        logger.info("Загрузка страницы через Playwright: url=%s", url)
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                channel="chrome",
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )

            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
                timezone_id="Europe/Berlin",
                java_script_enabled=True,
                color_scheme="light",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/136.0.0.0 Safari/537.36"
                ),
            )

            page = await context.new_page()

            await Stealth().apply_stealth_async(page)

            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                """)

            await page.goto(url, wait_until="domcontentloaded", timeout=120000)

            await page.wait_for_timeout(10000)

            logger.info(
                "Страница загружена через Playwright: title=%s", await page.title()
            )

            await page.screenshot(path="/app/debug.png", full_page=True)

            html = await page.content()

            await browser.close()

        return html

    async def extract_sku_from_url(self, url: str):
        html = await self._fetch_page_html(url)
        sku = parse_sku(html)
        return sku
