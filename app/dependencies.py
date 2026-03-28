"""Dependency factories shared by FastAPI route handlers.

`lru_cache` ensures these lightweight service objects are reused across requests
instead of being recreated for each injection.
"""

from functools import lru_cache

from app.clients.otto_client import OttoClient
from app.core.configs import settings
from app.core.otto_auth import OttoAuth
from app.services.product_creation_service import ProductCreationService
from app.services.product_service import ProductService


@lru_cache
def get_otto_auth() -> OttoAuth:
    """Create a cached OTTO auth helper configured from environment settings."""
    return OttoAuth(
        client_id=settings.otto_jv_client_id,
        client_secret=settings.otto_jv_client_secret,
        base_url=settings.otto_base_url,
        scope=settings.otto_scope,
        timeout=settings.otto_timeout_seconds,
    )


@lru_cache
def get_otto_client() -> OttoClient:
    """Create a cached OTTO HTTP client instance."""
    return OttoClient(
        auth=get_otto_auth(),
        base_url=settings.otto_base_url,
        timeout=settings.otto_timeout_seconds,
    )


@lru_cache
def get_product_service() -> ProductService:
    """Create a cached product service wrapper."""
    return ProductService(client=get_otto_client())


@lru_cache
def get_product_creation_service() -> ProductCreationService:
    """Create a cached upload/normalization creation service."""
    return ProductCreationService(product_service=get_product_service())
