#!/usr/bin/env python3
"""Cache Aftercool `/api/images-by-ean?ean=...` image URLs."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.database import SessionLocal
from app.services.aftercool_image_service import sync_aftercool_images_by_ean


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--account",
        choices=["jv", "xl"],
        help="Sync EANs only for one imported account. Default: all accounts.",
    )
    parser.add_argument("--ean", action="append", help="Sync a specific EAN.")
    parser.add_argument("--limit", type=int, help="Maximum number of EANs to fetch.")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument(
        "--timeout",
        type=float,
        help="HTTP timeout in seconds. Defaults to AFTERBUY_TIMEOUT_SECONDS.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Fetch even if an EAN already exists in cache.",
    )
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="With default only-missing mode, retry cached rows with status=failed.",
    )
    parser.add_argument(
        "--no-update-products",
        action="store_true",
        help="Do not copy cached image links into products.media_asset_links.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    async with SessionLocal() as session:
        result = await sync_aftercool_images_by_ean(
            session=session,
            account=args.account,
            eans=args.ean,
            limit=args.limit,
            only_missing=not args.refresh,
            concurrency=args.concurrency,
            batch_size=args.batch_size,
            update_products=not args.no_update_products,
            timeout_seconds=args.timeout,
            retry_failed=args.retry_failed,
        )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
