from dataclasses import dataclass

from app.schemas.enums import RoleEnum


@dataclass(slots=True)
class LoginCommand:
    email: str
    password: str


@dataclass(slots=True)
class RegisterEmployeeCommand:
    name: str
    last_name: str
    email: str
    password: str
    invite_token: str


@dataclass(slots=True)
class InviteEmployeeCommand:
    email: str
    invited_by_user_id: int


@dataclass(slots=True)
class CreateUserCommand:
    name: str
    last_name: str
    email: str
    password: str
    role: RoleEnum
