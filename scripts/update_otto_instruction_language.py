"""CLI for replacing OTTO instruction-language attribute values."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.otto_instruction_language_service import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_PAGE_SIZE,
    DEFAULT_POLL_MAX_ATTEMPTS,
    DEFAULT_POLL_SLEEP_SECONDS,
    DEFAULT_RETRY_BASE_DELAY_SECONDS,
    DEFAULT_SUBMIT_BATCH_SIZE,
    run_instruction_language_update,
    setup_instruction_language_logging,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch OTTO products by chunks, replace "
            "'Sprachen Bedienungs-/Aufbauanleitung' with 'Deutsch (DE)', "
            "and submit changed products back to OTTO."
        )
    )
    parser.add_argument(
        "--controller",
        choices=("jv", "xl"),
        help="OTTO account/controller. If omitted, the script asks interactively.",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help=f"Products fetched from OTTO per page. Default: {DEFAULT_PAGE_SIZE}.",
    )
    parser.add_argument(
        "--start-page",
        type=int,
        default=0,
        help="First OTTO product page to fetch. Use this to resume an interrupted run.",
    )
    parser.add_argument(
        "--submit-batch-size",
        type=int,
        default=DEFAULT_SUBMIT_BATCH_SIZE,
        help=(
            "Changed products submitted to OTTO per POST. "
            f"Default: {DEFAULT_SUBMIT_BATCH_SIZE}."
        ),
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Maximum number of fetched products to scan.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and check products, but do not submit changes.",
    )
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Do not poll OTTO update-task status after successful POST.",
    )
    parser.add_argument(
        "--poll-max-attempts",
        type=int,
        default=DEFAULT_POLL_MAX_ATTEMPTS,
        help=f"Maximum update-task polls per submitted batch. Default: {DEFAULT_POLL_MAX_ATTEMPTS}.",
    )
    parser.add_argument(
        "--poll-sleep-seconds",
        type=float,
        default=DEFAULT_POLL_SLEEP_SECONDS,
        help=f"Fallback sleep between update-task polls. Default: {DEFAULT_POLL_SLEEP_SECONDS}.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_MAX_RETRIES,
        help=f"Retries for OTTO fetch/submit/status requests. Default: {DEFAULT_MAX_RETRIES}.",
    )
    parser.add_argument(
        "--retry-base-delay-seconds",
        type=float,
        default=DEFAULT_RETRY_BASE_DELAY_SECONDS,
        help=(
            "Base exponential-backoff delay for retries. "
            f"Default: {DEFAULT_RETRY_BASE_DELAY_SECONDS}."
        ),
    )
    parser.add_argument(
        "--log-file",
        default="logs/otto_instruction_language_update.log",
        help="Dedicated log file path.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="Console/file log level. Default: INFO.",
    )
    return parser


def choose_controller(controller: str | None) -> str:
    if controller:
        return controller

    print("Choose OTTO account:")
    print("1. JV")
    print("2. XL")
    while True:
        selected = input("Account [1/2]: ").strip().lower()
        if selected in {"1", "jv"}:
            return "jv"
        if selected in {"2", "xl"}:
            return "xl"
        print("Please enter 1/JV or 2/XL.")


def log_level_from_text(value: str) -> int:
    return getattr(logging, str(value or "INFO").upper(), logging.INFO)


async def run() -> None:
    args = build_parser().parse_args()
    os.environ["LOG_FILE"] = args.log_file
    logger = setup_instruction_language_logging(
        args.log_file,
        level=log_level_from_text(args.log_level),
    )
    controller = choose_controller(args.controller)

    from app.dependencies import get_otto_client

    client = get_otto_client()

    try:
        result = await run_instruction_language_update(
            client,
            controller=controller,
            start_page=args.start_page,
            page_size=args.page_size,
            submit_batch_size=args.submit_batch_size,
            limit=args.limit,
            dry_run=args.dry_run,
            poll=not args.no_poll,
            poll_max_attempts=args.poll_max_attempts,
            poll_sleep_seconds=args.poll_sleep_seconds,
            max_retries=args.max_retries,
            retry_base_delay_seconds=args.retry_base_delay_seconds,
        )
    finally:
        await client.aclose()

    logger.info(
        "Finished: status=%s controller=%s start_page=%s fetched=%s scanned=%s with_attribute=%s "
        "already_target=%s changed=%s submitted=%s failed_products=%s "
        "batches_submitted=%s batches_failed=%s log_file=%s",
        result.status,
        result.controller,
        result.start_page,
        result.products_fetched,
        result.products_scanned,
        result.products_with_attribute,
        result.products_already_target,
        result.products_changed,
        result.products_submitted,
        result.products_failed,
        result.batches_submitted,
        result.batches_failed,
        args.log_file,
    )
    if result.errors:
        logger.error("Errors: %s", result.errors)


if __name__ == "__main__":
    asyncio.run(run())
