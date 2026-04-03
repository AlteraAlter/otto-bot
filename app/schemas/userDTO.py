import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.schemas.enums import RoleEnum


class UserDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    last_name: str
    role: RoleEnum | None = None


class UserRegisterDTO(BaseModel):
    name: str
    last_name: str
    email: EmailStr
    password: str
    invite_token: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", value):
            raise ValueError("Password must have at least one uppercase letter")
        if not re.search(r"[a-z]", value):
            raise ValueError("Password must have at least one lowercase letter")
        if not re.search(r"\d", value):
            raise ValueError("Pasword must have at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", value):
            raise ValueError("Password must have at least one special character")

        return value

    @field_validator("email")
    @classmethod
    def validate_gmail_address(cls, value: EmailStr) -> EmailStr:
        normalized = value.lower().strip()
        if not normalized.endswith("@gmail.com"):
            raise ValueError("Employee registration requires a Gmail address")
        return normalized

    @field_validator("invite_token")
    @classmethod
    def validate_invite_token(cls, value: str) -> str:
        token = value.strip()
        if not token:
            raise ValueError("Invitation token is required")
        return token


class AdminUserCreateDTO(BaseModel):
    name: str
    last_name: str
    email: EmailStr
    password: str
    role: RoleEnum

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return UserRegisterDTO.validate_password(value)


class AdminUserCreateResponseDTO(BaseModel):
    success: bool
    user: UserDTO


class UserLoginDTO(BaseModel):
    email: EmailStr
    password: str


class EmployeeInviteRequestDTO(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def validate_gmail_address(cls, value: EmailStr) -> EmailStr:
        normalized = value.lower().strip()
        if not normalized.endswith("@gmail.com"):
            raise ValueError("Invitations can only be sent to Gmail addresses")
        return normalized


class EmployeeInviteResponseDTO(BaseModel):
    success: bool
    email: EmailStr
    role: RoleEnum
    expires_at: datetime
