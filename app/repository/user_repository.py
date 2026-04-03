from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_invitations import UserInvitation
from app.models.user_roles import UserRoles
from app.models.users import User
from app.schemas.enums import RoleEnum


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

    async def assign_role(self, *, user_id: int, role: RoleEnum) -> UserRoles:
        user_role = UserRoles(role=role, user=user_id)
        self.db.add(user_role)
        await self.db.commit()
        await self.db.refresh(user_role)
        return user_role

    async def select_user_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email.lower().strip())
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

    async def delete_pending_invitations_for_email(
        self, *, email: str, role: RoleEnum
    ) -> None:
        stmt = delete(UserInvitation).where(
            UserInvitation.email == email.lower().strip(),
            UserInvitation.role == role,
            UserInvitation.accepted_at.is_(None),
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def create_invitation(
        self,
        *,
        email: str,
        role: RoleEnum,
        token_hash: str,
        invited_by: int | None,
        expires_at: datetime,
    ) -> UserInvitation:
        invitation = UserInvitation(
            email=email.lower().strip(),
            role=role,
            token_hash=token_hash,
            invited_by=invited_by,
            expires_at=expires_at,
        )
        self.db.add(invitation)
        await self.db.commit()
        await self.db.refresh(invitation)
        return invitation

    async def select_active_invitation_by_token_hash(
        self, token_hash: str
    ) -> UserInvitation | None:
        stmt = select(UserInvitation).where(
            UserInvitation.token_hash == token_hash,
            UserInvitation.accepted_at.is_(None),
            UserInvitation.expires_at > datetime.now(timezone.utc),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_invitation_accepted(self, invitation_id: int) -> UserInvitation | None:
        invitation = await self.db.get(UserInvitation, invitation_id)
        if invitation is None:
            return None
        invitation.accepted_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(invitation)
        return invitation
