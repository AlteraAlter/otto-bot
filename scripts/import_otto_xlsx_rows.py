#!/usr/bin/env python3
"""Import account-specific OTTO XLSX exports into otto_xlsx_import_rows."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.database import SessionLocal
from app.services.otto_xlsx_import_service import (
    ACCOUNT_NAMES,
    iter_xlsx_import_rows,
    replace_account_rows,
    upsert_xlsx_import_rows,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root",
        nargs="?",
        default="xlsx_import_files",
        help="Folder with jv/ and xl/ subfolders. Default: xlsx_import_files",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing imported rows for discovered accounts before importing.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Database upsert batch size.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    root = Path(args.root)
    if not root.exists():
        raise SystemExit(f"Import folder does not exist: {root}")

    account_files: dict[str, list[Path]] = {}
    for account_dir in sorted(root.iterdir()):
        if not account_dir.is_dir():
            continue
        account = account_dir.name.lower()
        if account not in ACCOUNT_NAMES:
            continue
        files = sorted(account_dir.glob("*.xlsx"))
        if files:
            account_files[account] = files

    if not account_files:
        raise SystemExit(f"No JV/XL XLSX files found under {root}")

    async with SessionLocal() as session:
        if args.replace:
            for account in account_files:
                deleted = await replace_account_rows(session, account)
                print(f"{account}: deleted {deleted} old rows")

        total = 0
        for account, files in account_files.items():
            for path in files:
                imported = 0
                batch = []
                for row in iter_xlsx_import_rows(path, account=account):
                    batch.append(row)
                    if len(batch) >= args.batch_size:
                        imported += await upsert_xlsx_import_rows(
                            session,
                            batch,
                            batch_size=args.batch_size,
                        )
                        batch = []
                if batch:
                    imported += await upsert_xlsx_import_rows(
                        session,
                        batch,
                        batch_size=args.batch_size,
                    )
                total += imported
                print(f"{account}: imported {imported} rows from {path}")
        print(f"done: imported/upserted {total} rows")


if __name__ == "__main__":
    asyncio.run(main())
