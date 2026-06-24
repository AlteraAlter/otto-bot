from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CategoryGroup(Base):
    __tablename__ = "category_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    name_ru: Mapped[str | None] = mapped_column(String, nullable=True)

    categories: Mapped[list["Category"]] = relationship(back_populates="group")

    attributes: Mapped[list["Attribute"]] = relationship(back_populates="group")
