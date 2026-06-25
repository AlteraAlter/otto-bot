"""ORM model for generated product variation rows."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProductVariant(Base):
    """One materialized variant combination for a local product row."""

    __tablename__ = "product_variants"
    __table_args__ = (
        Index("ix_product_variants_product_id", "product_id"),
        Index("ix_product_variants_product_reference", "product_reference"),
        Index(
            "uq_product_variants_product_combination_active",
            "product_id",
            "combination_key",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
        Index(
            "uq_product_variants_sku_active",
            "sku",
            unique=True,
            postgresql_where=text(
                "sku IS NOT NULL AND sku <> '' AND is_deleted = false"
            ),
        ),
        Index(
            "uq_product_variants_ean_active",
            "ean",
            unique=True,
            postgresql_where=text(
                "ean IS NOT NULL AND ean <> '' AND is_deleted = false"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_reference: Mapped[str | None] = mapped_column(String, nullable=True)
    combination_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    variation_attributes_snapshot: Mapped[list[dict]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    copied_product_data_snapshot: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    ean: Mapped[str | None] = mapped_column(String, nullable=True)
    sku: Mapped[str | None] = mapped_column(String, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    media_asset_links: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    generation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="generated",
        server_default="generated",
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
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
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    product = relationship("Product")
