from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column, validates
from sqlalchemy import String, Integer, Enum, null


class User(Base):

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    password: Mapped[str] = mapped_column(String, nullable=False)

    @validates("email")
    def validate_email(self, key, value):
        if "@" not in value:
            raise ValueError("Invalid email")
        return value
