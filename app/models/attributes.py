from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Attribute(Base):
    __tablename__ = "attributes"
    __table_args__ = (
        UniqueConstraint("group_id", "name", name="uq_attributes_group_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("category_groups.id", ondelete="CASCADE"),
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    name_ru: Mapped[str | None] = mapped_column(String, nullable=True)

    attribute_group: Mapped[str | None] = mapped_column(String, nullable=True)

    feature_relevance: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    type: Mapped[str] = mapped_column(String, nullable=False, unique=False)

    description: Mapped[str] = mapped_column(Text, nullable=True)

    description_ru: Mapped[str | None] = mapped_column(Text, nullable=True)

    multi_value: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    relevance: Mapped[str | None] = mapped_column(String(20), nullable=True)

    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)

    unit_display_name: Mapped[str | None] = mapped_column(String, nullable=True)

    group: Mapped["CategoryGroup"] = relationship(back_populates="attributes")

    allowed_values: Mapped[list["AttributeAllowedValue"]] = relationship(
        back_populates="attribute",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
