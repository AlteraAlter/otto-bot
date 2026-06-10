from app.database import Base


from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship
)
from sqlalchemy import Integer, ForeignKey


class VariationTheme(Base):
    __tablename__ = "variation_themes"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )
    
    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("category_groups.id"),
        nullable=False,
    )
    
    attribute_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("attributes.id"),
        nullable=False
    )

    group: Mapped["CategoryGroup"] = relationship()
    attribute: Mapped["Attribute"] = relationship()