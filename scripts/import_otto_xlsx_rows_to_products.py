#!/usr/bin/env python3
"""Import valid rows from `otto_xlsx_import_rows` into `products`."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.database import SessionLocal
from app.services.otto_xlsx_import_service import import_otto_xlsx_rows_to_products


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--account",
        choices=["jv", "xl"],
        help="Import only one account. Default: import all rows.",
    )
    parser.add_argument("--batch-size", type=int, default=1000)
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    async with SessionLocal() as session:
        result = await import_otto_xlsx_rows_to_products(
            session,
            account=args.account,
            batch_size=args.batch_size,
        )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
