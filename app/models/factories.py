from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime

from app.database import Base


class Factories(Base):
    
    __tablename__ = "factories"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    factory_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String, nullable=False, unique=False)
    items_count: Mapped[int] = mapped_column(Integer, nullable=False, unique=False)
    last_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=True)