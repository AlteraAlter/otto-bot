"""Wrapper exports for SEO description generation and robust decode helper."""

from app.generate_seo_descriptions import build_seo_description, decode_with_fallback

__all__ = ["build_seo_description", "decode_with_fallback"]
