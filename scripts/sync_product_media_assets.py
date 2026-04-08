"""CLI script to enrich local products with OTTO media URLs and descriptions."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.database import SessionLocal
from app.dependencies import get_product_service
from app.services.product_media_sync_service import sync_product_media_assets


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch OTTO product media asset URLs by SKU, append product descriptions, "
            "and save each response to the local database immediately."
        ),
    )
    parser.add_argument("--sku", help="Only sync one SKU.")
    parser.add_argument("--limit", type=int, help="Maximum number of local products to scan.")
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Only fetch products that do not already have saved media asset links.",
    )
    return parser


async def run() -> None:
    args = build_parser().parse_args()

    async with SessionLocal() as session:
        result = await sync_product_media_assets(
            db=session,
            product_service=get_product_service(),
            sku=args.sku,
            limit=args.limit,
            only_missing=args.only_missing,
            print_status_codes=True,
        )

    print(
        "Product media sync completed:",
        f"scanned={result.scanned_products}",
        f"updated={result.updated_products}",
        f"skipped={result.skipped_products}",
    )


if __name__ == "__main__":
    asyncio.run(run())
