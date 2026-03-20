from enum import unique

from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy import Enum

from app.database import Base
from app.schemas.enums import VatEnum


class Product(Base):

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    ean: Mapped[str] = mapped_column(String)
    pricing: Mapped[int] = mapped_column(Integer)
    vat: Mapped[VatEnum] = mapped_column(Enum(VatEnum, name="vat_enum"), nullable=False)
    productReference: Mapped[int] = mapped_column(Integer)
    brand_id: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    productLine: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    bullet_points: Mapped[list[str]] = mapped_column(ARRAY(String))
