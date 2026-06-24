from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AttributeAllowedValue(Base):
    __tablename__ = "attribute_allowed_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    attribute_id: Mapped[int] = mapped_column(Integer, ForeignKey("attributes.id"))

    value: Mapped[str] = mapped_column(String(255), nullable=False)

    value_ru: Mapped[str | None] = mapped_column(String(255), nullable=True)

    attribute: Mapped["Attribute"] = relationship(back_populates="allowed_values")
