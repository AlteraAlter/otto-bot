"""Dependency factories shared by FastAPI route handlers.

`lru_cache` ensures these lightweight service objects are reused across requests
instead of being recreated for each injection.
"""

from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.otto_client import OttoClient
from app.contexts.identity.application.services import IdentityService
from app.contexts.identity.infrastructure.messaging.smtp_invitation_mailer import (
    SMTPInvitationMailer,
)
from app.contexts.identity.infrastructure.repositories.sqlalchemy_user_account_repository import (
    SqlAlchemyUserAccountRepository,
)
from app.contexts.identity.infrastructure.security.jwt_token_issuer import (
    JwtTokenIssuer,
)
from app.contexts.identity.infrastructure.security.password_hasher import (
    PBKDF2PasswordHasher,
)
from app.contexts.identity.interfaces.http.mappers import (
    map_identity_error,
    to_user_dto,
)
from app.core.configs import settings
from app.core.otto_auth import OttoAuth
from app.database import get_db
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


def get_password_hasher() -> PBKDF2PasswordHasher:
    return PBKDF2PasswordHasher()


def get_token_issuer() -> JwtTokenIssuer:
    return JwtTokenIssuer(
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def get_invitation_mailer() -> SMTPInvitationMailer:
    return SMTPInvitationMailer(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_username=settings.smtp_username,
        smtp_password=settings.smtp_password,
        smtp_sender_email=settings.smtp_sender_email,
        smtp_use_tls=settings.smtp_use_tls,
        frontend_app_url=settings.frontend_app_url,
    )


def get_identity_repository(
    db: AsyncSession = Depends(get_db),
) -> SqlAlchemyUserAccountRepository:
    return SqlAlchemyUserAccountRepository(db=db)


def get_identity_service(
    repository: SqlAlchemyUserAccountRepository = Depends(get_identity_repository),
) -> IdentityService:
    return IdentityService(
        repository=repository,
        password_hasher=get_password_hasher(),
        token_issuer=get_token_issuer(),
        invitation_mailer=get_invitation_mailer(),
        access_token_expire_minutes=settings.jwt_access_token_expire_minutes,
        invitation_expire_hours=settings.employee_invitation_expire_hours,
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    identity_service: IdentityService = Depends(get_identity_service),
) -> UserDTO:
    """Resolve the current authenticated user from the bearer token."""
    try:
        user = await identity_service.get_current_user(token)
    except Exception as exc:  # mapped to HTTP once at the interface boundary
        raise map_identity_error(exc) from exc
    return to_user_dto(user)


get_user_auth = get_identity_service


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
