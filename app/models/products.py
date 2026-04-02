"""ORM model for persisted product snapshots used by local querying endpoints."""

from sqlalchemy import String, Integer, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy import Enum
from typing import Optional

from app.database import Base
from app.schemas.enums import VatEnum


class Product(Base):
    """Product master row synchronized from OTTO and queried by local API routes."""

    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("sku", name="uq_sku"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    account_source: Mapped[str] = mapped_column(String(20), nullable=False)
    ean: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pricing: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    vat: Mapped[VatEnum] = mapped_column(Enum(VatEnum, name="vat_enum"), nullable=False)
    productReference: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    brand_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    productLine: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bullet_points: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
