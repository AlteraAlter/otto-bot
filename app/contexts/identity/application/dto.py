from dataclasses import dataclass
from datetime import datetime

from app.contexts.identity.domain.entities import AuthenticatedUser
from app.schemas.enums import RoleEnum


@dataclass(slots=True)
class IssuedToken:
    access_token: str
    token_type: str
    expires_in: int


@dataclass(slots=True)
class InviteEmployeeResult:
    success: bool
    email: str
    role: RoleEnum
    expires_at: datetime


@dataclass(slots=True)
class CreateUserResult:
    success: bool
    user: AuthenticatedUser
