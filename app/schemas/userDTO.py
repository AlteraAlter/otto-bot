import re

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

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        print("VALIDATOR CALLED")
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


class UserLoginDTO(BaseModel):
    email: EmailStr
    password: str
