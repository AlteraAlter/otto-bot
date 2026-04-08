"""Package wrapper around the repo-root `generate_seo_descriptions.py` script."""

from app.script_loader import load_repo_root_module

_module = load_repo_root_module(
    "repo_root_generate_seo_descriptions",
    "generate_seo_descriptions.py",
)

build_seo_description = _module.build_seo_description
decode_with_fallback = _module.decode_with_fallback
is_meaningful = _module.is_meaningful
normalize_key = _module.normalize_key
sanitize_value = _module.sanitize_value

__all__ = [
    "build_seo_description",
    "decode_with_fallback",
    "is_meaningful",
    "normalize_key",
    "sanitize_value",
]
