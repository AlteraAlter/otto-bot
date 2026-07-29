from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AttributeFillChunk(Base):
    __tablename__ = "attribute_fill_chunks"
    __table_args__ = (
        UniqueConstraint("process_id", "chunk_id", name="uq_attribute_fill_chunk"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    process_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("factory_task_states.process_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_id: Mapped[int] = mapped_column(Integer, nullable=False)
    ai_key_slot: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="queued",
        index=True,
    )
    product_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generated_attributes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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


class AttributeFillItem(Base):
    __tablename__ = "attribute_fill_items"
    __table_args__ = (
        UniqueConstraint("process_id", "sku", name="uq_attribute_fill_item_sku"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    process_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("factory_task_states.process_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    ai_key_slot: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    sku: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    ean: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    product_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    product_category: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    active_status: Mapped[object | None] = mapped_column(JSONB, nullable=True)
    marketplace_status: Mapped[object | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="inactive",
        index=True,
    )
    raw_product: Mapped[dict] = mapped_column(JSONB, nullable=False)
    result_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    attributes_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
