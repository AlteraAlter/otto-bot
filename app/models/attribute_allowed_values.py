from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AttributeAllowedValue(Base):
    __tablename__ = "attribute_allowed_values"
    __table_args__ = (
        UniqueConstraint(
            "attribute_id",
            "value",
            name="uq_attribute_allowed_values_attribute_value",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    attribute_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("attributes.id", ondelete="CASCADE"),
    )

    value: Mapped[str] = mapped_column(String(255), nullable=False)

    value_ru: Mapped[str | None] = mapped_column(String(255), nullable=True)

    attribute: Mapped["Attribute"] = relationship(back_populates="allowed_values")
