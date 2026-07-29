#!/usr/bin/env python3
"""Build materialized JV-to-XL EAN mappings from imported OTTO XLSX rows."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.database import SessionLocal
from app.services.otto_xlsx_import_service import rebuild_ean_mappings_by_name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-account", default="jv")
    parser.add_argument("--target-account", default="xl")
    parser.add_argument("--minimum-score", type=float, default=0.62)
    parser.add_argument("--batch-size", type=int, default=1000)
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    async with SessionLocal() as session:
        result = await rebuild_ean_mappings_by_name(
            session,
            source_account=args.source_account,
            target_account=args.target_account,
            minimum_score=args.minimum_score,
            batch_size=args.batch_size,
        )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
