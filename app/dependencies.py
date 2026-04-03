"""Dependency factories shared by FastAPI route handlers.

`lru_cache` ensures these lightweight service objects are reused across requests
instead of being recreated for each injection.
"""

from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.otto_client import OttoClient
from app.core.configs import settings
from app.core.otto_auth import OttoAuth
from app.core.user_auth import UserAuth
from app.database import get_db
from app.repository.user_repository import UserRepository
from app.services.product_creation_service import ProductCreationService
from app.services.product_service import ProductService
from app.schemas.enums import RoleEnum
from app.schemas.userDTO import UserDTO

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login")


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


def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    """Create a request-scoped user repository bound to the active DB session."""
    return UserRepository(db=db)


def get_user_auth(
    user_repository: UserRepository = Depends(get_user_repository),
) -> UserAuth:
    """Create a request-scoped user auth service."""
    return UserAuth(
        user_repository=user_repository,
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        access_token_expire_minutes=settings.jwt_access_token_expire_minutes,
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    user_auth: UserAuth = Depends(get_user_auth),
) -> UserDTO:
    """Resolve the current authenticated user from the bearer token."""
    return await user_auth.get_current_user(token)


def require_role(allowed_roles: list[str] | list[RoleEnum]):
    allowed_role_values = {
        role.value if isinstance(role, RoleEnum) else role for role in allowed_roles
    }

    async def role_checker(current_user: UserDTO = Depends(get_current_user)) -> UserDTO:
        user_role = current_user.role.value if current_user.role else None
        if user_role not in allowed_role_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return current_user

    return role_checker
