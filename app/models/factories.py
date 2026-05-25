from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime

from app.database import Base


class Factories(Base):

    __tablename__ = "factories"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    factory_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
        unique=True,
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
        unique=False,
    )

    kind: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    account: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    items_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    last_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
    )