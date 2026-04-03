from fastapi import HTTPException, status

from app.contexts.identity.application.dto import (
    CreateUserResult,
    InviteEmployeeResult,
    IssuedToken,
)
from app.contexts.identity.domain.entities import AuthenticatedUser
from app.contexts.identity.domain.exceptions import (
    IdentityError,
    InvalidCredentialsError,
    InvitationDeliveryError,
    InvitationEmailMismatchError,
    InvitationEmailNotConfiguredError,
    InvitationInvalidError,
    TokenExpiredError,
    TokenValidationError,
    UserAlreadyExistsError,
    UserNotFoundError,
)
from app.schemas.tokenDTO import TokenDTO
from app.schemas.userDTO import (
    AdminUserCreateResponseDTO,
    EmployeeInviteResponseDTO,
    UserDTO,
)


def map_identity_error(exc: IdentityError) -> HTTPException:
    if isinstance(exc, InvalidCredentialsError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    if isinstance(exc, TokenExpiredError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    if isinstance(exc, TokenValidationError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    if isinstance(exc, UserNotFoundError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )
    if isinstance(exc, UserAlreadyExistsError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, (InvitationInvalidError, InvitationEmailMismatchError)):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, InvitationEmailNotConfiguredError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        )
    if isinstance(exc, InvitationDeliveryError):
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(exc) or "Identity operation failed",
    )


def to_token_dto(token: IssuedToken) -> TokenDTO:
    return TokenDTO(
        access_token=token.access_token,
        token_type=token.token_type,
        expires_in=token.expires_in,
    )


def to_user_dto(user: AuthenticatedUser) -> UserDTO:
    return UserDTO(
        id=user.id,
        name=user.name,
        email=user.email,
        last_name=user.last_name,
        role=user.role,
    )


def to_invite_response_dto(result: InviteEmployeeResult) -> EmployeeInviteResponseDTO:
    return EmployeeInviteResponseDTO(
        success=result.success,
        email=result.email,
        role=result.role,
        expires_at=result.expires_at,
    )


def to_admin_create_response_dto(
    result: CreateUserResult,
) -> AdminUserCreateResponseDTO:
    return AdminUserCreateResponseDTO(
        success=result.success,
        user=to_user_dto(result.user),
    )
