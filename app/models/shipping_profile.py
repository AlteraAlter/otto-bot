from app.database import Base

from sqlalchemy import (
    String,
    Integer
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import (
    Mapped,
    mapped_column
)


class ShippingProfile(Base):
    __tablename__ = "shipping_profiles"
    
    
    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )
    
    shipping_profile_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        unique=True,
    )
    shipping_profile_name: Mapped[str] = mapped_column(
        String,
        nullable=False,
        unique=False
    )
    working_days: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=list,
        nullable=False
    )
    order_cutoff: Mapped[str] = mapped_column(
        String,
        nullable=True
    )
    delivery_type: Mapped[str] = mapped_column(
        String,
        nullable=True
    )
    default_processing_time: Mapped[int] = mapped_column(
        Integer,
        nullable=True
    )
    transport_time: Mapped[int] = mapped_column(
        Integer,
        nullable=True
    )