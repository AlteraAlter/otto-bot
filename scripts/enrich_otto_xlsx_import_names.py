#!/usr/bin/env python3
"""Fill OTTO XLSX import row product names from OTTO products API."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.clients.otto_client import OttoClient
from app.core.configs import settings
from app.core.otto_auth import OttoAuth
from app.database import SessionLocal
from app.services.otto_xlsx_import_service import enrich_import_names_from_otto_api


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--account",
        action="append",
        choices=["jv", "xl"],
        help="Account to enrich. Can be passed multiple times. Default: jv and xl.",
    )
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--start-page", type=int, default=0)
    parser.add_argument("--limit-pages", type=int, default=None)
    parser.add_argument("--max-retries", type=int, default=8)
    parser.add_argument("--retry-base-sleep-seconds", type=float, default=8.0)
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing product_name values.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    auth = OttoAuth(
        client_id=settings.otto_jv_client_id,
        client_secret=settings.otto_jv_client_secret,
        xl_client_id=settings.otto_xl_client_id,
        xl_client_secret=settings.otto_xl_client_secret,
        base_url=settings.otto_base_url,
        scope=settings.otto_scope,
        timeout=settings.otto_timeout_seconds,
    )
    client = OttoClient(
        auth=auth,
        base_url=settings.otto_base_url,
        timeout=settings.otto_timeout_seconds,
    )
    try:
        async with SessionLocal() as session:
            for account in args.account or ["jv", "xl"]:
                result = await enrich_import_names_from_otto_api(
                    session,
                    client=client,
                    account=account,
                    page_size=args.page_size,
                    start_page=args.start_page,
                    limit_pages=args.limit_pages,
                    only_missing=not args.overwrite,
                    max_retries=args.max_retries,
                    retry_base_sleep_seconds=args.retry_base_sleep_seconds,
                )
                print(result)
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
