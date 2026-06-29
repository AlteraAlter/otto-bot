"""Variant image generation abstraction and status transitions."""

from __future__ import annotations

import base64
import logging
import os
import re
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from openai import APIStatusError, AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.configs import settings
from app.models.product_variants import ProductVariant
from app.services.image_processing_service import normalize_generated_image

logger = logging.getLogger(__name__)

try:  # Pillow is optional in the current project dependency set.
    from PIL import Image
except ImportError:  # pragma: no cover - depends on deployment image
    Image = None


class VariantImageProvider(Protocol):
    async def generate(self, prompt: str, source_image_url: str | None) -> bytes:
        """Generate a new image and return raw bytes."""


class UnavailableVariantImageProvider:
    async def generate(self, prompt: str, source_image_url: str | None) -> bytes:
        del prompt, source_image_url
        raise RuntimeError("Variant image provider is not configured yet.")


class FurnitureImageGenerationError(Exception):
    pass


class OpenAIVariantImageProvider:
    def __init__(self) -> None:
        self.api_key = settings.openai_api_key or settings.gpt_key
        self.client = AsyncOpenAI(
            api_key=self.api_key or "missing-openai-api-key",
            timeout=settings.openai_image_timeout_seconds,
        )

    async def generate(self, prompt: str, source_image_url: str | None) -> bytes:
        if not self.api_key:
            raise RuntimeError("OpenAI image provider is not configured: missing API key.")
        source = await load_source_image(source_image_url)
        if source is None:
            raise FurnitureImageGenerationError("Source image is required for furniture variant generation.")
        return await self._edit(prompt, source)

    async def _edit(self, prompt: str, source: tuple[str, bytes, str]) -> bytes:
        _filename, content, _mime_type = source
        image_file = openai_image_file(content)

        for options in self._edit_attempts():
            image_file.seek(0)
            try:
                response = await self.client.images.edit(
                    image=image_file,
                    prompt=prompt,
                    **options,
                )
                return decode_openai_image_response_object(response)
            except APIStatusError as exc:
                logger.warning(
                    "openai_image_edit_failed status=%s request_id=%s body=%s options=%s",
                    exc.status_code,
                    getattr(exc, "request_id", None),
                    str(getattr(exc, "body", None) or exc)[:1000],
                    sanitize_openai_options(options),
                )
                if exc.status_code != 400:
                    raise

        raise FurnitureImageGenerationError("OpenAI image edit failed for all parameter variants.")

    def _edit_attempts(self) -> list[dict[str, str]]:
        primary_model = str(settings.openai_image_model or "gpt-image-2").strip() or "gpt-image-2"
        fallback_model = str(settings.openai_image_fallback_model or "gpt-image-1").strip() or "gpt-image-1"
        base = {
            "quality": str(settings.openai_image_quality or "high").strip() or "high",
            "size": str(settings.openai_image_edit_size or "auto").strip() or "auto",
            "output_format": "png",
        }
        attempts: list[dict[str, str]] = [
            {**base, "model": primary_model, "input_fidelity": "high"},
            {**base, "model": primary_model},
        ]
        if fallback_model != primary_model:
            attempts.append({**base, "model": fallback_model})
        return attempts

    def _candidate_models(self) -> list[str]:
        models = [
            str(settings.openai_image_model or "").strip(),
            str(settings.openai_image_fallback_model or "").strip(),
        ]
        return list(dict.fromkeys([model for model in models if model]))

    def _status_error(self, response: httpx.Response) -> httpx.HTTPStatusError:
        return httpx.HTTPStatusError(
            f"OpenAI image request failed with {response.status_code}: {response.text[:500]}",
            request=response.request,
            response=response,
        )

    def _should_try_next_model(self, response: httpx.Response) -> bool:
        if response.status_code not in {400, 404}:
            return False
        detail = response.text.casefold()
        return any(
            token in detail
            for token in (
                "model",
                "unsupported",
                "not supported",
                "not found",
                "does not exist",
                "invalid_value",
                "unknown parameter",
            )
        )


def decode_openai_image_response(payload: dict) -> bytes:
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        raise RuntimeError("OpenAI image response did not include image data.")
    first = data[0] if isinstance(data[0], dict) else {}
    encoded = first.get("b64_json")
    if not encoded:
        raise RuntimeError("OpenAI image response did not include base64 image data.")
    return base64.b64decode(encoded)


def decode_openai_image_response_object(response: object) -> bytes:
    data = getattr(response, "data", None)
    if not data:
        raise FurnitureImageGenerationError("Модель не вернула изображение.")

    first = data[0]
    encoded = getattr(first, "b64_json", None)
    if not encoded and isinstance(first, dict):
        encoded = first.get("b64_json")
    if not encoded:
        raise FurnitureImageGenerationError("Модель вернула пустое изображение.")

    return base64.b64decode(encoded)


def openai_image_file(image_bytes: bytes) -> BytesIO:
    image_file = BytesIO()

    if Image is not None:
        try:
            with Image.open(BytesIO(image_bytes)) as image:
                image.save(image_file, format="PNG")
            image_file.seek(0)
            image_file.name = "source.png"
            return image_file
        except Exception:
            image_file = BytesIO()

    image_file.write(image_bytes)
    image_file.seek(0)
    image_file.name = "source.png"
    return image_file


def sanitize_openai_options(options: dict[str, str]) -> dict[str, str]:
    return {
        key: value
        for key, value in options.items()
        if key in {"model", "quality", "size", "output_format", "input_fidelity"}
    }


def local_media_path(url: str) -> Path | None:
    parsed = urlparse(url)
    path = parsed.path if parsed.scheme else url
    for prefix, root in (
        (settings.generated_media_url_prefix.rstrip("/"), settings.generated_media_root),
        ("/uploads", os.getenv("UPLOADS_DIR", "storage/uploads")),
    ):
        normalized_prefix = prefix or "/generated-media"
        if path == normalized_prefix or path.startswith(f"{normalized_prefix}/"):
            relative = path[len(normalized_prefix):].lstrip("/")
            candidate = (Path(root) / relative).resolve()
            root_path = Path(root).resolve()
            if root_path == candidate or root_path in candidate.parents:
                return candidate
    return None


async def load_source_image(source_image_url: str | None) -> tuple[str, bytes, str] | None:
    if not source_image_url:
        return None
    source = source_image_url.strip()
    if not source:
        return None

    local_path = local_media_path(source)
    if local_path is not None and local_path.exists():
        return local_path.name, local_path.read_bytes(), mime_type_for_image(local_path.name)

    parsed = urlparse(source)
    if parsed.scheme not in {"http", "https"}:
        return None
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(source)
        response.raise_for_status()
    filename = Path(parsed.path).name or "source-image.jpg"
    content_type = response.headers.get("content-type", "").split(";")[0].strip()
    return filename, response.content, content_type or mime_type_for_image(filename)


async def source_image_dimensions(
    source_image_url: str | None,
) -> tuple[int, int] | None:
    if Image is None:
        return None

    source = await load_source_image(source_image_url)
    if source is None:
        return None
    _filename, content, _mime_type = source
    try:
        with Image.open(BytesIO(content)) as image:
            return image.size
    except Exception:
        return None


def mime_type_for_image(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "image/jpeg"


def safe_media_filename(value: str, *, suffix: str = ".jpg") -> str:
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip(".-")
    if not stem:
        stem = uuid4().hex
    if not stem.lower().endswith(suffix.lower()):
        stem = f"{stem}{suffix}"
    return stem


def build_variant_image_prompt(variant: ProductVariant) -> str:
    color, material = furniture_surface_parts(variant.variation_attributes_snapshot or [])
    return build_furniture_image_prompt(
        color=color,
        material=material,
        object_type="furniture",
    )


def build_variant_image_prompt_from_snapshot(combination: list[dict[str, str]]) -> str:
    color, material = furniture_surface_parts(combination)
    return build_furniture_image_prompt(
        color=color,
        material=material,
        object_type="furniture",
    )


def build_furniture_image_prompt(
    *,
    color: str,
    material: str,
    object_type: str = "furniture",
) -> str:
    return f"""
Use the uploaded image as the source of truth.

This is the exact same {object_type}. Change only its visible surface:

- new color: {color}
- new material: {material}

Strict requirements:
- preserve the exact shape and geometry;
- preserve all dimensions and proportions;
- preserve the number and position of cushions;
- preserve seams, stitching, folds, legs, handles and details;
- preserve the camera angle and perspective;
- preserve the original background;
- preserve the original lighting and shadows;
- do not add or remove any objects;
- do not redesign the furniture;
- do not change the room;
- do not add text, logos or watermarks.

Only replace the original color and material of the furniture.
Render realistic {material} texture with natural highlights,
folds and reflections matching the original lighting.

The output must look like another product variant photographed
in exactly the same conditions.
""".strip()


def furniture_surface_parts(combination: list[dict[str, str]]) -> tuple[str, str]:
    color_values: list[str] = []
    material_values: list[str] = []
    fallback_values: list[str] = []

    for item in combination:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").lower()
        value = str(item.get("value") or "").strip()
        if not value:
            continue
        if any(token in name for token in ("color", "colour", "farbe", "grundfarbe")):
            color_values.append(value)
            continue
        if any(token in name for token in ("material", "bezug", "stoff", "fabric")):
            material_values.append(value)
            continue
        fallback_values.append(value)

    color = ", ".join(dict.fromkeys(color_values)) or "same as the selected variant"
    material = ", ".join(dict.fromkeys(material_values)) or ", ".join(dict.fromkeys(fallback_values)) or "same as the selected variant"
    return color, material


def visual_material_color_parts(combination: list[dict[str, str]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for item in combination:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").lower()
        if any(token in name for token in ("material", "bezug", "stoff", "fabric", "color", "colour", "farbe", "grundfarbe")):
            result.append(item)
    return result


async def store_generated_image(
    *,
    content: bytes,
    variant_id: int,
    filename_stem: str | None = None,
    suffix: str = ".jpg",
    target_size: tuple[int, int] | None = None,
) -> tuple[str, str]:
    root = Path(settings.generated_media_root)
    root.mkdir(parents=True, exist_ok=True)
    filename = safe_media_filename(filename_stem or f"variant-{variant_id}-{uuid4().hex}", suffix=suffix)
    destination = root / filename
    destination.write_bytes(content)
    normalized = normalize_generated_image(destination, target_size=target_size)
    url = f"{settings.generated_media_url_prefix.rstrip('/')}/{normalized.name}"
    logger.info(
        "variant_image_saved path=%s url=%s bytes=%s",
        normalized.as_posix(),
        url,
        normalized.stat().st_size if normalized.exists() else 0,
    )
    return normalized.as_posix(), url


async def generate_variant_image_from_snapshot(
    *,
    combination: list[dict[str, str]],
    source_image_url: str | None,
    request_id: str | None = None,
    provider: VariantImageProvider | None = None,
) -> dict[str, str]:
    image_provider = provider or OpenAIVariantImageProvider()
    content = await image_provider.generate(
        build_variant_image_prompt_from_snapshot(combination),
        source_image_url,
    )
    path, url = await store_generated_image(
        content=content,
        variant_id=0,
        filename_stem=request_id,
        target_size=await source_image_dimensions(source_image_url),
    )
    return {"imagePath": path, "imageUrl": url}


async def regenerate_variant_image(
    session: AsyncSession,
    *,
    variant_id: int,
    provider: VariantImageProvider | None = None,
) -> ProductVariant:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None or variant.is_deleted:
        raise ValueError("Variant not found")

    variant.status = "generating_image"
    variant.generation_error = None
    variant.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(variant)

    image_provider = provider or OpenAIVariantImageProvider()
    try:
        source_image_url = (variant.media_asset_links or [None])[0] or variant.image_url
        content = await image_provider.generate(
            build_variant_image_prompt(variant),
            source_image_url,
        )
        path, url = await store_generated_image(
            content=content,
            variant_id=variant.id,
            target_size=await source_image_dimensions(source_image_url),
        )
        variant.image_path = path
        variant.image_url = url
        variant.media_asset_links = [url]
        variant.status = "ready"
        variant.generation_error = None
    except Exception as exc:
        variant.status = "failed"
        variant.generation_error = str(exc)

    variant.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(variant)
    return variant
