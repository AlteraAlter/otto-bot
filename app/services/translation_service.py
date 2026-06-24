import asyncio
import re
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.configs import settings
from app.models.translation_cache import TranslationCache


def normalize_translation_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


class TranslationError(RuntimeError):
    pass


@dataclass(frozen=True)
class TranslationRequest:
    text: str
    source_lang: str | None
    target_lang: str
    context: str | None = None
    provider: str = "deepl"


class DeepLTranslationService:
    _rate_limit_lock = asyncio.Lock()
    _next_request_at = 0.0

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
        min_interval_seconds: float | None = None,
        max_retries: int | None = None,
        retry_base_delay_seconds: float | None = None,
    ) -> None:
        self.api_key = (api_key or settings.deepl_api_key_test or "").strip()
        raw_base_url = (base_url or settings.deepl_url).rstrip("/")
        if raw_base_url.endswith("/v2/translate"):
            raw_base_url = raw_base_url[: -len("/v2/translate")]
        elif raw_base_url.endswith("/v2"):
            raw_base_url = raw_base_url[: -len("/v2")]
        self.base_url = raw_base_url
        self.timeout = timeout if timeout is not None else settings.deepl_timeout_seconds
        self.min_interval_seconds = (
            min_interval_seconds
            if min_interval_seconds is not None
            else settings.deepl_min_interval_seconds
        )
        self.max_retries = max_retries if max_retries is not None else settings.deepl_max_retries
        self.retry_base_delay_seconds = (
            retry_base_delay_seconds
            if retry_base_delay_seconds is not None
            else settings.deepl_retry_base_delay_seconds
        )

    async def translate(self, text: str, *, source_lang: str | None, target_lang: str) -> str:
        normalized = normalize_translation_text(text)
        if not normalized:
            return ""
        if not self.api_key:
            raise TranslationError("DeepL API key is not configured.")

        payload: dict[str, object] = {
            "text": [normalized],
            "target_lang": target_lang.upper(),
        }
        if source_lang:
            payload["source_lang"] = source_lang.upper()

        response: httpx.Response | None = None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(self.max_retries + 1):
                await self._wait_for_rate_limit_slot()
                try:
                    response = await client.post(
                        f"{self.base_url}/v2/translate",
                        headers={
                            "Authorization": f"DeepL-Auth-Key {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    response.raise_for_status()
                    break
                except httpx.HTTPStatusError as exc:
                    if not self._should_retry(exc.response.status_code, attempt):
                        raise TranslationError(f"DeepL translation failed: {exc}") from exc
                    await asyncio.sleep(self._retry_delay(attempt, exc.response))
                except httpx.RequestError as exc:
                    if attempt >= self.max_retries:
                        raise TranslationError(f"DeepL translation failed: {exc}") from exc
                    await asyncio.sleep(self._retry_delay(attempt))

        if response is None:
            raise TranslationError("DeepL translation failed without a response.")

        translations = response.json().get("translations")
        if not isinstance(translations, list) or not translations:
            raise TranslationError("DeepL response did not contain translations.")
        translated = translations[0].get("text")
        if not isinstance(translated, str):
            raise TranslationError("DeepL response translation is invalid.")
        return normalize_translation_text(translated)

    async def _wait_for_rate_limit_slot(self) -> None:
        interval = max(0.0, float(self.min_interval_seconds))
        if interval <= 0:
            return

        async with self._rate_limit_lock:
            now = time.monotonic()
            wait_seconds = max(0.0, self.__class__._next_request_at - now)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
                now = time.monotonic()
            self.__class__._next_request_at = now + interval

    def _should_retry(self, status_code: int, attempt: int) -> bool:
        if attempt >= self.max_retries:
            return False
        return status_code in {429, 500, 502, 503, 504}

    def _retry_delay(self, attempt: int, response: httpx.Response | None = None) -> float:
        retry_after = self._retry_after_seconds(response) if response is not None else None
        if retry_after is not None:
            return min(max(retry_after, self.min_interval_seconds), 90.0)

        exponential = self.retry_base_delay_seconds * (2 ** attempt)
        return min(max(exponential, self.min_interval_seconds), 90.0)

    @staticmethod
    def _retry_after_seconds(response: httpx.Response | None) -> float | None:
        if response is None:
            return None
        value = response.headers.get("Retry-After")
        if not value:
            return None
        try:
            return max(0.0, float(value))
        except ValueError:
            pass
        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        return max(0.0, retry_at.timestamp() - time.time())


class TranslationService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        provider: str = "deepl",
        deepl: DeepLTranslationService | None = None,
    ) -> None:
        self.db = db
        self.provider = provider
        self.deepl = deepl or DeepLTranslationService()

    async def translate(
        self,
        text: str,
        *,
        source_lang: str | None,
        target_lang: str,
        context: str | None = None,
    ) -> str:
        original_text = normalize_translation_text(text)
        if not original_text:
            return ""

        source = source_lang.upper() if source_lang else None
        target = target_lang.upper()
        ctx = normalize_translation_text(context) if context else None

        cached = await self._get_cached(
            original_text=original_text,
            source_lang=source,
            target_lang=target,
            context=ctx,
        )
        if cached is not None:
            return cached

        translated = await self.deepl.translate(
            original_text,
            source_lang=source,
            target_lang=target,
        )
        await self._store_cached(
            original_text=original_text,
            translated_text=translated,
            source_lang=source,
            target_lang=target,
            context=ctx,
        )
        return translated

    async def translate_many(
        self,
        values: list[str],
        *,
        source_lang: str | None,
        target_lang: str,
        context: str | None = None,
    ) -> list[str]:
        translated: list[str] = []
        for value in values:
            translated.append(
                await self.translate(
                    value,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    context=context,
                )
            )
        return translated

    async def _get_cached(
        self,
        *,
        original_text: str,
        source_lang: str | None,
        target_lang: str,
        context: str | None,
    ) -> str | None:
        result = await self.db.execute(
            select(TranslationCache.translated_text).where(
                TranslationCache.original_text == original_text,
                TranslationCache.source_lang == source_lang,
                TranslationCache.target_lang == target_lang,
                TranslationCache.provider == self.provider,
                TranslationCache.context == context,
            )
        )
        return result.scalar_one_or_none()

    async def _store_cached(
        self,
        *,
        original_text: str,
        translated_text: str,
        source_lang: str | None,
        target_lang: str,
        context: str | None,
    ) -> None:
        self.db.add(
            TranslationCache(
                original_text=original_text,
                translated_text=translated_text,
                source_lang=source_lang,
                target_lang=target_lang,
                provider=self.provider,
                context=context,
            )
        )
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
