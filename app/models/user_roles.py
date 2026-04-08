

from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, Enum
from app.schemas.enums import RoleEnum

class UserRoles(Base):
    
    __tablename__ = "user_roles"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[RoleEnum] = mapped_column(Enum(RoleEnum, name="role_enum"), nullable=False)
    user: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))     
    