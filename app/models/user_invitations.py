from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.database import Base
from app.schemas.enums import RoleEnum


class UserInvitation(Base):
    __tablename__ = "user_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum, name="role_enum", create_type=False),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    invited_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    @validates("email")
    def validate_email(self, key: str, value: str) -> str:
        if "@" not in value:
            raise ValueError("Invalid email")
        return value.lower().strip()
