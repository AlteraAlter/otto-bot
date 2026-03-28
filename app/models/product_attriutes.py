"""ORM model for flattened product attribute/value pairs per SKU."""

from sqlalchemy import ForeignKey, String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductAttributes(Base):
    """Stores one attribute value per row for a synchronized product SKU."""

    __tablename__ = "product_descriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_sku: Mapped[str] = mapped_column(String, ForeignKey("products.sku"))
    name: Mapped[str] = mapped_column(String)
    value: Mapped[str] = mapped_column(String)
