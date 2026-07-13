"""Run AI attribute fill for active marketplace products."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from uuid import uuid4

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.attribute_fill_service import (
    run_attribute_fill_task,
)
from app.dependencies import get_product_service


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch products from OTTO, keep only products active in both OTTO "
            "status endpoints, and fill missing attributes."
        )
    )
    parser.add_argument("--controller", default="xl")
    parser.add_argument("--process-id", default=None)
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    process_id = args.process_id or str(uuid4())
    result = await run_attribute_fill_task(
        process_id=process_id,
        product_service=get_product_service(),
        controller=args.controller,
    )
    print(
        "attribute fill finished: "
        f"process_id={process_id} "
        f"status={result.get('status')} "
        f"selected={result.get('selected_products')} "
        f"updated={result.get('updated_products')} "
        f"skipped={result.get('skipped_products')} "
        f"failed={result.get('failed_products')} "
        f"attributes={result.get('generated_attributes')}"
    )


if __name__ == "__main__":
    asyncio.run(main())
