from functools import lru_cache

from app.clients.otto_client import OttoClient
from app.core.configs import settings
from app.core.otto_auth import OttoAuth
from app.services.product_service import ProductService


@lru_cache
def get_otto_auth() -> OttoAuth:
    return OttoAuth(
        client_id=settings.otto_jv_client_id,
        client_secret=settings.otto_jv_client_secret,
        base_url=settings.otto_base_url,
        scope=settings.otto_scope,
        timeout=settings.otto_timeout_seconds,
    )


@lru_cache
def get_otto_client() -> OttoClient:
    return OttoClient(
        auth=get_otto_auth(),
        base_url=settings.otto_base_url,
        timeout=settings.otto_timeout_seconds,
    )


@lru_cache
def get_product_service() -> ProductService:
    return ProductService(client=get_otto_client())
