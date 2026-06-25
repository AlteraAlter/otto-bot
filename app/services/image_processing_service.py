"""Configurable image post-processing helpers for generated media."""

from __future__ import annotations

from pathlib import Path

from app.core.configs import settings

try:  # Pillow is optional in the current project dependency set.
    from PIL import Image
except ImportError:  # pragma: no cover - depends on deployment image
    Image = None


def normalize_generated_image(
    path: str | Path,
    *,
    target_size: tuple[int, int] | None = None,
) -> Path:
    """Normalize generated image files when Pillow is available.

    The byte limit is an internal configurable target, not an official OTTO
    maximum. If Pillow is not installed, the original file is left untouched so
    variant generation can still complete.
    """
    source = Path(path)
    if Image is None or not source.exists():
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
        rgb = center_product_on_light_canvas(rgb)

        if target_size is not None:
            rgb = fit_image_on_canvas(rgb, target_size)
        else:
            max_side = max(1, int(settings.otto_image_max_side))
            width, height = rgb.size
            if max(width, height) > max_side:
                rgb.thumbnail((max_side, max_side))

        min_width = max(1, int(settings.otto_image_min_width))
        min_height = max(1, int(settings.otto_image_min_height))
        if rgb.width < min_width or rgb.height < min_height:
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


def center_product_on_light_canvas(image: "Image.Image") -> "Image.Image":
    """Center the non-background area on a light product-image canvas."""
    if Image is None:
        return image

    rgb = image.convert("RGB")
    pixels = rgb.load()
    width, height = rgb.size
    threshold = 246
    min_x, min_y = width, height
    max_x, max_y = -1, -1

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if r < threshold or g < threshold or b < threshold:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x < min_x or max_y < min_y:
        return rgb

    margin_x = max(24, int(width * 0.04))
    margin_y = max(24, int(height * 0.04))
    crop_left = max(0, min_x - margin_x)
    crop_top = max(0, min_y - margin_y)
    crop_right = min(width, max_x + margin_x + 1)
    crop_bottom = min(height, max_y + margin_y + 1)
    crop = rgb.crop((crop_left, crop_top, crop_right, crop_bottom))

    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    paste_x = max(0, (width - crop.width) // 2)
    paste_y = max(0, (height - crop.height) // 2)
    canvas.paste(crop, (paste_x, paste_y))
    return canvas
