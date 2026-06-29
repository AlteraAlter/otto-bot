"""Configurable image post-processing helpers for generated media."""

from __future__ import annotations

from pathlib import Path

from app.core.configs import settings

try:
    from PIL import Image
except ImportError:  # pragma: no cover - depends on deployment image
    Image = None


def normalize_generated_image(
    path: str | Path,
    *,
    target_size: tuple[int, int] | None = None,
) -> Path:
    """Normalize generated image files.

    The byte limit is an internal configurable target, not an official OTTO
    maximum. When target_size is provided, the saved image must match those
    exact pixel dimensions.
    """
    source = Path(path)
    if Image is None:
        if target_size is not None:
            raise RuntimeError("Pillow is required to preserve source image dimensions.")
        return source
    if not source.exists():
        return source

    allowed_formats = {
        item.strip().lower() for item in settings.otto_allowed_image_formats.split(",")
    }
    target_format = "JPEG" if "jpg" in allowed_formats or "jpeg" in allowed_formats else "PNG"
    suffix = ".jpg" if target_format == "JPEG" else ".png"
    target = source.with_suffix(suffix)

    with Image.open(source) as image:
        if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            background.alpha_composite(rgba)
            rgb = background.convert("RGB")
        else:
            rgb = image.convert("RGB")

        preserve_exact_size = target_size is not None
        if preserve_exact_size:
            rgb = fit_image_on_canvas(rgb, target_size)
        else:
            max_side = max(1, int(settings.otto_image_max_side))
            width, height = rgb.size
            if max(width, height) > max_side:
                rgb.thumbnail((max_side, max_side))

        if preserve_exact_size and rgb.size != target_size:
            raise ValueError(
                f"Generated image size mismatch: {rgb.width}x{rgb.height}, "
                f"expected {target_size[0]}x{target_size[1]}."
            )

        min_width = max(1, int(settings.otto_image_min_width))
        min_height = max(1, int(settings.otto_image_min_height))
        if not preserve_exact_size and (rgb.width < min_width or rgb.height < min_height):
            raise ValueError(
                f"Image is too small: {rgb.width}x{rgb.height}, "
                f"minimum {min_width}x{min_height}."
            )

        if target_format == "JPEG":
            quality = 92
            while quality >= 70:
                rgb.save(target, format=target_format, optimize=True, quality=quality)
                if target.stat().st_size <= settings.otto_image_target_max_bytes:
                    break
                quality -= 5
        else:
            rgb.save(target, format=target_format, optimize=True)

    if target_size is not None:
        with Image.open(target) as saved:
            if saved.size != target_size:
                raise ValueError(
                    f"Saved generated image size mismatch: {saved.width}x{saved.height}, "
                    f"expected {target_size[0]}x{target_size[1]}."
                )

    return target


def fit_image_on_canvas(
    image: "Image.Image",
    target_size: tuple[int, int],
) -> "Image.Image":
    """Fit an image into an exact-size white canvas without distorting it."""
    if Image is None:
        return image

    target_width, target_height = target_size
    if target_width <= 0 or target_height <= 0:
        return image

    fitted = image.copy()
    fitted.thumbnail((target_width, target_height))
    canvas = Image.new("RGB", (target_width, target_height), (255, 255, 255))
    paste_x = max(0, (target_width - fitted.width) // 2)
    paste_y = max(0, (target_height - fitted.height) // 2)
    canvas.paste(fitted, (paste_x, paste_y))
    return canvas
