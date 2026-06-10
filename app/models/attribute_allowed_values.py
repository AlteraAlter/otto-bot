from app.database import Base

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship
)
from sqlalchemy import (
    Integer,
    String,
    ForeignKey
)

class AttributeAllowedValue(Base):
    __tablename__ = "attribute_allowed_values"


    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )
    
    attribute_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("attributes.id")
    )
    
    value: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    
    attribute: Mapped["Attribute"] = relationship(
        back_populates="allowed_values"
    )