from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_roles import UserRoles
from app.models.users import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db: AsyncSession = db

    async def create_user(
        self,
        *,
        name: str,
        last_name: str,
        email: str,
        password: str,
    ) -> User:
        user = User(
            name=name,
            last_name=last_name,
            email=email,
            password=password,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def select_user_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def select_user_by_id(self, user_id: int) -> User | None:
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def select_user_with_role_by_id(self, user_id: int) -> tuple[User, object | None] | None:
        stmt = (
            select(User, UserRoles.role)
            .outerjoin(UserRoles, UserRoles.user == User.id)
            .where(User.id == user_id)
        )
        result = await self.db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return row[0], row[1]
