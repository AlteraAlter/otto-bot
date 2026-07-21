"""Update OTTO instruction-language attributes in fetched product chunks."""

from __future__ import annotations

import asyncio
import copy
import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TYPE_CHECKING, Any, Awaitable, Callable

import httpx

from app.normalize_product_to_schema import brand_id_for_controller

if TYPE_CHECKING:
    from app.clients.otto_client import OttoClient

ATTRIBUTE_NAME = "Sprachen Bedienungs-/Aufbauanleitung"
TARGET_VALUE = "Deutsch (DE)"
DEFAULT_PAGE_SIZE = 100
DEFAULT_SUBMIT_BATCH_SIZE = 50
DEFAULT_MAX_RETRIES = 5
DEFAULT_RETRY_BASE_DELAY_SECONDS = 2.0
DEFAULT_POLL_MAX_ATTEMPTS = 60
DEFAULT_POLL_SLEEP_SECONDS = 10.0
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}

LOGGER_NAME = "otto_instruction_language_update"
logger = logging.getLogger(LOGGER_NAME)


@dataclass
class BatchStatus:
    page: int
    batch: int
    batch_size: int
    submitted: int = 0
    failed: int = 0
    state: str = ""
    process_id: str | None = None
    create_result: Any = None
    update_result: Any = None
    failed_result: Any = None
    error: str | None = None


@dataclass
class InstructionLanguageUpdateResult:
    controller: str
    status: str = "done"
    start_page: int = 0
    pages_fetched: int = 0
    pages_failed: int = 0
    products_fetched: int = 0
    products_scanned: int = 0
    products_with_attribute: int = 0
    products_already_target: int = 0
    products_changed: int = 0
    products_submitted: int = 0
    products_failed: int = 0
    batches_submitted: int = 0
    batches_failed: int = 0
    total_from_otto: int | None = None
    dry_run: bool = False
    errors: list[dict[str, Any]] = field(default_factory=list)
    batch_statuses: list[BatchStatus] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["batch_statuses"] = [asdict(item) for item in self.batch_statuses]
        return data


def setup_instruction_language_logging(
    log_file: str | Path = "logs/otto_instruction_language_update.log",
    *,
    level: int = logging.INFO,
) -> logging.Logger:
    """Configure a dedicated logger for this maintenance script."""
    path = Path(log_file)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path
    path.parent.mkdir(parents=True, exist_ok=True)

    logger.setLevel(level)
    logger.propagate = False

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        "%Y-%m-%d %H:%M:%S",
    )

    file_handler_exists = any(
        isinstance(handler, RotatingFileHandler)
        and Path(getattr(handler, "baseFilename", "")) == path
        for handler in logger.handlers
    )
    if not file_handler_exists:
        file_handler = RotatingFileHandler(
            path,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(level)
        logger.addHandler(file_handler)

    stream_handler_exists = any(
        isinstance(handler, logging.StreamHandler)
        and not isinstance(handler, RotatingFileHandler)
        for handler in logger.handlers
    )
    if not stream_handler_exists:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        stream_handler.setLevel(level)
        logger.addHandler(stream_handler)

    return logger


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _as_list(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in (
        "productVariations",
        "products",
        "items",
        "results",
        "content",
        "data",
    ):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def _extract_total(payload: Any) -> int | None:
    if not isinstance(payload, dict):
        return None
    for key in ("total", "totalElements", "totalCount", "count"):
        try:
            value = int(payload.get(key))
        except (TypeError, ValueError):
            continue
        if value >= 0:
            return value
    return None


def _has_next_page(payload: Any) -> bool | None:
    if not isinstance(payload, dict):
        return None
    links = payload.get("links")
    if not isinstance(links, list):
        return None
    return any(
        isinstance(link, dict) and str(link.get("rel") or "").casefold() == "next"
        for link in links
    )


def _sku_from_product(product: Any) -> str | None:
    if not isinstance(product, dict):
        return None
    for key in ("sku", "SKU", "productSku"):
        sku = normalize_text(product.get(key))
        if sku:
            return sku
    return None


def _attribute_values(attr: dict[str, Any]) -> Any:
    if "values" in attr:
        return attr.get("values")
    return attr.get("value")


def _is_target_value(value: Any) -> bool:
    if isinstance(value, list):
        normalized_values = [normalize_text(item) for item in value if normalize_text(item)]
        return normalized_values == [TARGET_VALUE]
    return normalize_text(value) == TARGET_VALUE


def replace_instruction_language_attribute(
    product: dict[str, Any],
) -> tuple[dict[str, Any] | None, bool]:
    """Return an updated product copy and whether the attribute already matched."""
    description = product.get("productDescription")
    if not isinstance(description, dict):
        return None, False
    attributes = description.get("attributes")
    if not isinstance(attributes, list):
        return None, False

    matching_indexes: list[int] = []
    all_matching_already_target = True
    for index, attr in enumerate(attributes):
        if not isinstance(attr, dict):
            continue
        if normalize_text(attr.get("name")).casefold() != ATTRIBUTE_NAME.casefold():
            continue
        matching_indexes.append(index)
        all_matching_already_target = all_matching_already_target and _is_target_value(
            _attribute_values(attr)
        )

    if not matching_indexes:
        return None, False
    if all_matching_already_target:
        return None, True

    updated = copy.deepcopy(product)
    updated_description = updated["productDescription"]
    updated_attributes = updated_description["attributes"]
    for index in matching_indexes:
        attr = updated_attributes[index]
        if "values" in attr or "value" not in attr:
            attr["values"] = [TARGET_VALUE]
        else:
            attr["value"] = TARGET_VALUE

    return updated, False


def prepare_product_for_submit(product: dict[str, Any], *, controller: str) -> dict[str, Any]:
    """Strip read-only GET fields while preserving the product update payload."""
    allowed_top_level = {
        "productReference",
        "sku",
        "ean",
        "productDescription",
        "mediaAssets",
        "pricing",
        "logistics",
        "order",
        "compliance",
    }
    prepared = {
        key: value
        for key, value in copy.deepcopy(product).items()
        if key in allowed_top_level and value is not None
    }
    description = prepared.setdefault("productDescription", {})
    if not isinstance(description, dict):
        description = {}
        prepared["productDescription"] = description
    description.setdefault("brandId", brand_id_for_controller(controller))
    return prepared


def _extract_href(link: Any) -> str:
    if isinstance(link, dict):
        return str(link.get("href") or "")
    return str(getattr(link, "href", "") or "")


def extract_process_id(create_result: Any) -> str | None:
    if isinstance(create_result, dict):
        links = create_result.get("links")
        if isinstance(links, list):
            for link in links:
                match = re.search(r"update-tasks/([^/?#]+)", _extract_href(link))
                if match:
                    return match.group(1)
        message = str(create_result.get("message") or "")
    else:
        links = getattr(create_result, "links", None)
        if isinstance(links, list):
            for link in links:
                match = re.search(r"update-tasks/([^/?#]+)", _extract_href(link))
                if match:
                    return match.group(1)
        message = str(getattr(create_result, "message", "") or "")

    match = re.search(
        r"\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b",
        message,
        re.IGNORECASE,
    )
    return match.group(1) if match else None


def _read_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _state_from_create_result(create_result: Any) -> str:
    if isinstance(create_result, dict):
        return str(create_result.get("state") or "").lower()
    return str(getattr(create_result, "state", "") or "").lower()


def _compute_poll_sleep_seconds(update_result: Any, fallback: float) -> float:
    if not isinstance(update_result, dict):
        return fallback
    ping_after_value = update_result.get("pingAfter")
    if not isinstance(ping_after_value, str):
        return fallback
    try:
        ping_after = datetime.fromisoformat(ping_after_value.replace("Z", "+00:00"))
    except ValueError:
        return fallback
    delta = (ping_after - datetime.now(UTC)).total_seconds()
    return max(1.0, min(fallback, delta if delta > 0 else 1.0))


def _retry_after_seconds(exc: Exception, fallback: float) -> float:
    response = getattr(exc, "response", None)
    retry_after = response.headers.get("retry-after") if response is not None else None
    try:
        value = float(retry_after) if retry_after else None
    except (TypeError, ValueError):
        value = None
    return value if value is not None and value >= 0 else fallback


def _is_retryable_error(exc: Exception) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code if exc.response is not None else None
        return status_code in RETRYABLE_STATUS_CODES
    return False


async def _call_with_retries(
    operation: str,
    func: Callable[[], Awaitable[Any]],
    *,
    max_retries: int,
    retry_base_delay_seconds: float,
) -> Any:
    attempts = max(1, max_retries + 1)
    for attempt in range(1, attempts + 1):
        try:
            return await func()
        except Exception as exc:
            retryable = _is_retryable_error(exc)
            if not retryable or attempt >= attempts:
                logger.exception(
                    "step=otto_instruction_language_operation_failed operation=%s attempt=%s/%s retryable=%s error=%s",
                    operation,
                    attempt,
                    attempts,
                    retryable,
                    exc,
                )
                raise

            delay = _retry_after_seconds(
                exc,
                min(60.0, retry_base_delay_seconds * (2 ** (attempt - 1))),
            )
            logger.warning(
                "step=otto_instruction_language_retry operation=%s attempt=%s/%s sleep_seconds=%.2f error=%s",
                operation,
                attempt,
                attempts,
                delay,
                exc,
            )
            await asyncio.sleep(delay)


async def poll_update_task(
    client: OttoClient,
    *,
    process_id: str,
    controller: str,
    max_polls: int = DEFAULT_POLL_MAX_ATTEMPTS,
    poll_sleep_seconds: float = DEFAULT_POLL_SLEEP_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_base_delay_seconds: float = DEFAULT_RETRY_BASE_DELAY_SECONDS,
) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    update_result: dict[str, Any] = {}
    state = ""

    for poll_index in range(1, max(1, max_polls) + 1):
        update_result = await _call_with_retries(
            f"poll update task {process_id}",
            lambda: client.update_tasks(process_id, controller=controller),
            max_retries=max_retries,
            retry_base_delay_seconds=retry_base_delay_seconds,
        )
        state = str(update_result.get("state") or "").lower()
        logger.info(
            "step=otto_instruction_language_poll process_id=%s poll=%s/%s state=%s progress=%s total=%s failed=%s",
            process_id,
            poll_index,
            max_polls,
            state,
            update_result.get("progress"),
            update_result.get("total"),
            update_result.get("failed"),
        )
        if state in {"done", "failed", "error"}:
            break
        await asyncio.sleep(
            _compute_poll_sleep_seconds(update_result, poll_sleep_seconds)
        )

    failed_result: dict[str, Any] | None = None
    if _read_int(update_result.get("failed")) > 0:
        failed_result = await _call_with_retries(
            f"fetch failed task results {process_id}",
            lambda: client.failed_tasks(process_id, controller=controller),
            max_retries=max_retries,
            retry_base_delay_seconds=retry_base_delay_seconds,
        )
        logger.error(
            "step=otto_instruction_language_failed_results process_id=%s failed_result=%s",
            process_id,
            failed_result,
        )

    return update_result, failed_result, state


async def _submit_changed_products(
    client: OttoClient,
    *,
    controller: str,
    page: int,
    products: list[dict[str, Any]],
    submit_batch_size: int,
    poll: bool,
    poll_max_attempts: int,
    poll_sleep_seconds: float,
    max_retries: int,
    retry_base_delay_seconds: float,
    result: InstructionLanguageUpdateResult,
) -> None:
    for start in range(0, len(products), submit_batch_size):
        batch_index = start // submit_batch_size + 1
        batch = products[start : start + submit_batch_size]
        batch_status = BatchStatus(page=page, batch=batch_index, batch_size=len(batch))
        result.batch_statuses.append(batch_status)
        logger.info(
            "step=otto_instruction_language_submit_start controller=%s page=%s batch=%s batch_size=%s",
            controller,
            page,
            batch_index,
            len(batch),
        )

        try:
            create_result = await _call_with_retries(
                f"submit page {page} batch {batch_index}",
                lambda batch=batch: client.create_or_update_products_raw(
                    batch,
                    controller=controller,
                ),
                max_retries=max_retries,
                retry_base_delay_seconds=retry_base_delay_seconds,
            )
            result.batches_submitted += 1
            result.products_submitted += len(batch)
            batch_status.submitted = len(batch)
            batch_status.create_result = create_result
            batch_status.state = _state_from_create_result(create_result)
            batch_status.process_id = extract_process_id(create_result)

            if poll and batch_status.process_id:
                (
                    update_result,
                    failed_result,
                    state,
                ) = await poll_update_task(
                    client,
                    process_id=batch_status.process_id,
                    controller=controller,
                    max_polls=poll_max_attempts,
                    poll_sleep_seconds=poll_sleep_seconds,
                    max_retries=max_retries,
                    retry_base_delay_seconds=retry_base_delay_seconds,
                )
                batch_status.update_result = update_result
                batch_status.failed_result = failed_result
                batch_status.state = state

                failed_count = _read_int(update_result.get("failed"))
                batch_status.failed = failed_count
                result.products_failed += failed_count
                if state in {"failed", "error"} or failed_count > 0:
                    result.batches_failed += 1
                    result.status = "failed"
                    result.errors.append(
                        {
                            "page": page,
                            "batch": batch_index,
                            "processId": batch_status.process_id,
                            "state": state,
                            "failed": failed_count,
                            "failedResult": failed_result,
                        }
                    )
            elif poll:
                logger.warning(
                    "step=otto_instruction_language_no_process_id page=%s batch=%s create_result=%s",
                    page,
                    batch_index,
                    create_result,
                )

            logger.info(
                "step=otto_instruction_language_submit_done controller=%s page=%s batch=%s state=%s process_id=%s submitted=%s failed=%s",
                controller,
                page,
                batch_index,
                batch_status.state,
                batch_status.process_id,
                batch_status.submitted,
                batch_status.failed,
            )
        except Exception as exc:
            result.status = "failed"
            result.batches_failed += 1
            result.products_failed += len(batch)
            batch_status.failed = len(batch)
            batch_status.error = str(exc)
            result.errors.append(
                {
                    "page": page,
                    "batch": batch_index,
                    "skus": [_sku_from_product(item) for item in batch],
                    "error": str(exc),
                }
            )
            logger.exception(
                "step=otto_instruction_language_submit_failed controller=%s page=%s batch=%s batch_size=%s error=%s",
                controller,
                page,
                batch_index,
                len(batch),
                exc,
            )


async def run_instruction_language_update(
    client: OttoClient,
    *,
    controller: str,
    start_page: int = 0,
    page_size: int = DEFAULT_PAGE_SIZE,
    submit_batch_size: int = DEFAULT_SUBMIT_BATCH_SIZE,
    limit: int | None = None,
    dry_run: bool = False,
    poll: bool = True,
    poll_max_attempts: int = DEFAULT_POLL_MAX_ATTEMPTS,
    poll_sleep_seconds: float = DEFAULT_POLL_SLEEP_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_base_delay_seconds: float = DEFAULT_RETRY_BASE_DELAY_SECONDS,
) -> InstructionLanguageUpdateResult:
    """Fetch OTTO products page-by-page and submit language-attribute updates."""
    controller = normalize_text(controller).lower()
    start_page = max(0, start_page)
    page_size = max(1, page_size)
    submit_batch_size = max(1, submit_batch_size)
    result = InstructionLanguageUpdateResult(
        controller=controller,
        start_page=start_page,
        dry_run=dry_run,
    )
    page = start_page

    logger.info(
        "step=otto_instruction_language_run_start controller=%s start_page=%s page_size=%s submit_batch_size=%s limit=%s dry_run=%s poll=%s",
        controller,
        start_page,
        page_size,
        submit_batch_size,
        limit,
        dry_run,
        poll,
    )

    while True:
        if limit is not None and result.products_scanned >= limit:
            break

        try:
            payload = await _call_with_retries(
                f"fetch page {page}",
                lambda page=page: client.get_products_raw(
                    {"page": page, "limit": page_size},
                    controller=controller,
                ),
                max_retries=max_retries,
                retry_base_delay_seconds=retry_base_delay_seconds,
            )
        except Exception as exc:
            result.status = "failed"
            result.pages_failed += 1
            result.errors.append({"page": page, "stage": "fetch", "error": str(exc)})
            logger.exception(
                "step=otto_instruction_language_fetch_failed controller=%s page=%s error=%s",
                controller,
                page,
                exc,
            )
            break

        if result.total_from_otto is None:
            result.total_from_otto = _extract_total(payload)

        page_products = [item for item in _as_list(payload) if isinstance(item, dict)]
        if limit is not None:
            remaining = max(0, limit - result.products_scanned)
            page_products = page_products[:remaining]

        result.pages_fetched += 1
        result.products_fetched += len(page_products)
        logger.info(
            "step=otto_instruction_language_page_fetched controller=%s page=%s page_products=%s scanned=%s total=%s has_next=%s",
            controller,
            page,
            len(page_products),
            result.products_scanned,
            result.total_from_otto,
            _has_next_page(payload),
        )

        changed_products: list[dict[str, Any]] = []
        for product in page_products:
            result.products_scanned += 1
            updated_product, already_target = replace_instruction_language_attribute(
                product
            )
            if already_target:
                result.products_with_attribute += 1
                result.products_already_target += 1
                continue
            if updated_product is None:
                continue

            result.products_with_attribute += 1
            result.products_changed += 1
            changed_products.append(
                prepare_product_for_submit(updated_product, controller=controller)
            )

        logger.info(
            "step=otto_instruction_language_page_checked controller=%s page=%s changed=%s products_with_attribute=%s already_target=%s scanned=%s",
            controller,
            page,
            len(changed_products),
            result.products_with_attribute,
            result.products_already_target,
            result.products_scanned,
        )

        if changed_products and dry_run:
            logger.info(
                "step=otto_instruction_language_dry_run_skip_submit controller=%s page=%s changed=%s skus=%s",
                controller,
                page,
                len(changed_products),
                [_sku_from_product(item) for item in changed_products],
            )
        elif changed_products:
            await _submit_changed_products(
                client,
                controller=controller,
                page=page,
                products=changed_products,
                submit_batch_size=submit_batch_size,
                poll=poll,
                poll_max_attempts=poll_max_attempts,
                poll_sleep_seconds=poll_sleep_seconds,
                max_retries=max_retries,
                retry_base_delay_seconds=retry_base_delay_seconds,
                result=result,
            )

        if not page_products:
            break
        has_next = _has_next_page(payload)
        if has_next is False:
            break
        if (
            result.total_from_otto is not None
            and result.products_fetched >= result.total_from_otto
        ):
            break
        if has_next is None and len(page_products) < page_size:
            break

        page += 1

    logger.info("step=otto_instruction_language_run_done result=%s", result.as_dict())
    return result
