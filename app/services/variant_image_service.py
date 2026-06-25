"""Variant image generation abstraction and status transitions."""

from __future__ import annotations

import base64
import os
import re
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.configs import settings
from app.models.product_variants import ProductVariant
from app.services.image_processing_service import normalize_generated_image

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


class OpenAIVariantImageProvider:
    def __init__(self) -> None:
        self.api_key = settings.openai_api_key or settings.gpt_key

    async def generate(self, prompt: str, source_image_url: str | None) -> bytes:
        source = await load_source_image(source_image_url)
        if source is not None:
            return await self._edit(prompt, source)
        return await self._generate(prompt)

    async def _generate(self, prompt: str) -> bytes:
        payload = {
            "model": settings.openai_image_model,
            "prompt": prompt,
            "size": settings.openai_image_size,
            "quality": settings.openai_image_quality,
            "background": settings.openai_image_background,
            "output_format": settings.openai_image_output_format,
        }
        async with httpx.AsyncClient(timeout=settings.openai_image_timeout_seconds) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            response.raise_for_status()
        return decode_openai_image_response(response.json())

    async def _edit(self, prompt: str, source: tuple[str, bytes, str]) -> bytes:
        filename, content, mime_type = source
        data = {
            "model": settings.openai_image_model,
            "prompt": prompt,
            "size": settings.openai_image_size,
            "quality": settings.openai_image_quality,
            "background": settings.openai_image_background,
            "output_format": settings.openai_image_output_format,
        }
        files = {"image": (filename, content, mime_type)}
        async with httpx.AsyncClient(timeout=settings.openai_image_timeout_seconds) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/edits",
                headers={"Authorization": f"Bearer {self.api_key}"},
                data=data,
                files=files,
            )
            response.raise_for_status()
        return decode_openai_image_response(response.json())


def decode_openai_image_response(payload: dict) -> bytes:
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        raise RuntimeError("OpenAI image response did not include image data.")
    first = data[0] if isinstance(data[0], dict) else {}
    encoded = first.get("b64_json")
    if not encoded:
        raise RuntimeError("OpenAI image response did not include base64 image data.")
    return base64.b64decode(encoded)


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
    combination = visual_material_color_parts(variant.variation_attributes_snapshot or [])
    parts = [
        f"{item.get('name')}: {item.get('value')}"
        for item in combination
        if isinstance(item, dict) and item.get("name") and item.get("value")
    ]
    detail = ", ".join(parts) if parts else "the selected material, upholstery, and color values"
    return (
        "Edit the provided main product image into an OTTO marketplace compliant "
        "horizontal landscape product variant image. Preserve the exact product shape, construction, "
        "camera angle, lighting, perspective, framing, cast shadow, contact shadow, "
        "ambient shadow, and composition. Keep the original shadow direction, "
        "softness, opacity, and floor contact exactly as in the reference image. "
        "Use a clean opaque white or very light neutral studio background, no text, "
        "no logos, no watermark, no decorative props, no border, and keep the whole "
        "product centered horizontally and vertically with comfortable margins inside "
        "the landscape frame. Change only the visible material, "
        f"upholstery, fabric, and color appearance to match: {detail}. Do not change "
        "the model, dimensions, number of parts, pose, or non-variant details."
    )


def build_variant_image_prompt_from_snapshot(combination: list[dict[str, str]]) -> str:
    parts = [
        f"{item.get('name')}: {item.get('value')}"
        for item in visual_material_color_parts(combination)
        if isinstance(item, dict) and item.get("name") and item.get("value")
    ]
    detail = ", ".join(parts) if parts else "the selected material, upholstery, and color values"
    return (
        "Edit the provided main product image into an OTTO marketplace compliant "
        "horizontal landscape product variant image. Preserve the exact product shape, construction, "
        "camera angle, lighting, perspective, framing, cast shadow, contact shadow, "
        "ambient shadow, and composition. Keep the original shadow direction, "
        "softness, opacity, and floor contact exactly as in the reference image. "
        "Use a clean opaque white or very light neutral studio background, no text, "
        "no logos, no watermark, no decorative props, no border, and keep the whole "
        "product centered horizontally and vertically with comfortable margins inside "
        "the landscape frame. Change only the visible material, "
        f"upholstery, fabric, and color appearance to match: {detail}. Do not change "
        "the model, dimensions, number of parts, pose, or non-variant details."
    )


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
