"""Package wrapper around the repo-root `normalize_product_to_schema.py` script."""

from app.script_loader import load_repo_root_module

_module = load_repo_root_module(
    "repo_root_normalize_product_to_schema",
    "normalize_product_to_schema.py",
)

build_normalized_product = _module.build_normalized_product

__all__ = ["build_normalized_product"]
