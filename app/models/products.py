"""ORM model for products imported from OTTO marketplace XLSX exports."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    """One spreadsheet row imported into the local `products` table."""

    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("sku", name="uq_products_sku"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_reference: Mapped[str | None] = mapped_column(String, nullable=True)
    sku: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    ean: Mapped[str | None] = mapped_column(String, nullable=True)
    moin: Mapped[str | None] = mapped_column(String, nullable=True)
    product_category: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_time: Mapped[str | None] = mapped_column(String, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_retail_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    sale_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    sale_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    sale_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    marketplace_status: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    active_status: Mapped[str | None] = mapped_column(String, nullable=True)
    otto_url: Mapped[str | None] = mapped_column(String, nullable=True)
    media_asset_links: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )
    last_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
