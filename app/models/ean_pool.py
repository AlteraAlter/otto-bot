"""Pool of free EAN values for generated product variants."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EanPoolItem(Base):
    """One free/reserved/used EAN for variants that do not exist in source fetches."""

    __tablename__ = "ean_pool"
    __table_args__ = (
        Index("ix_ean_pool_status", "status"),
        Index("ix_ean_pool_source", "source"),
        Index("ix_ean_pool_reserved_for", "reserved_for"),
        Index("ix_ean_pool_used_for", "used_for"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ean: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="available",
        server_default="available",
    )
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reserved_for: Mapped[str | None] = mapped_column(String(255), nullable=True)
    used_for: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    reserved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
