from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Attribute(Base):
    __tablename__ = "attributes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("category_groups.id"))

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    name_ru: Mapped[str | None] = mapped_column(String, nullable=True)

    type: Mapped[str] = mapped_column(String, nullable=False, unique=False)

    description: Mapped[str] = mapped_column(Text, nullable=True)

    description_ru: Mapped[str | None] = mapped_column(Text, nullable=True)

    multi_value: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    relevance: Mapped[str | None] = mapped_column(String(20), nullable=True)

    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)

    group: Mapped["CategoryGroup"] = relationship(back_populates="attributes")

    allowed_values: Mapped[list["AttributeAllowedValue"]] = relationship(
        back_populates="attribute"
    )
