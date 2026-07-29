"""Cached Aftercool image URLs keyed by EAN."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductImageCache(Base):
    """One cached `/api/images-by-ean` response."""

    __tablename__ = "product_image_cache"
    __table_args__ = (UniqueConstraint("ean", name="uq_product_image_cache_ean"),)

    ean: Mapped[str] = mapped_column(String, primary_key=True)
    product_id: Mapped[str | None] = mapped_column(String, nullable=True)
    gallery_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    picture_urls: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )
    media_asset_links: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )
    account: Mapped[str | None] = mapped_column(String(20), nullable=True)
    product_factory_id: Mapped[str | None] = mapped_column(String, nullable=True)
    lister_factory_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="fetched")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
