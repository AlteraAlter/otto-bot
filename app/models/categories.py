from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("category_groups.id", ondelete="CASCADE")
    )

    group: Mapped["CategoryGroup"] = relationship(back_populates="categories")
