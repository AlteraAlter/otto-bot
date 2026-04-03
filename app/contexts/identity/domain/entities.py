from dataclasses import dataclass
from datetime import datetime

from app.schemas.enums import RoleEnum


@dataclass(slots=True)
class UserAccount:
    id: int
    name: str
    last_name: str
    email: str
    password_hash: str
    role: RoleEnum | None = None


@dataclass(slots=True)
class UserInvitation:
    id: int
    email: str
    role: RoleEnum
    token_hash: str
    invited_by: int | None
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


@dataclass(slots=True)
class AuthenticatedUser:
    id: int
    name: str
    last_name: str
    email: str
    role: RoleEnum | None
