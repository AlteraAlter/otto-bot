from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VariationTheme(Base):
    __tablename__ = "variation_themes"
    __table_args__ = (
        UniqueConstraint(
            "group_id",
            "attribute_id",
            name="uq_variation_themes_group_attribute",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("category_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    attribute_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("attributes.id", ondelete="CASCADE"),
        nullable=False,
    )

    group: Mapped["CategoryGroup"] = relationship()
    attribute: Mapped["Attribute"] = relationship()
