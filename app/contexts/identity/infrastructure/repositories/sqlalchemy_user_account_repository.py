from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contexts.identity.domain.entities import (
    AuthenticatedUser,
    UserAccount,
    UserInvitation,
)
from app.models.user_invitations import UserInvitation as UserInvitationModel
from app.models.user_roles import UserRoles
from app.models.users import User
from app.schemas.enums import RoleEnum


class SqlAlchemyUserAccountRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, email: str) -> UserAccount | None:
        stmt = select(User).where(User.email == email.lower().strip())
        result = await self.db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return UserAccount(
            id=row.id,
            name=row.name,
            last_name=row.last_name,
            email=row.email,
            password_hash=row.password,
        )

    async def create_user(
        self,
        *,
        name: str,
        last_name: str,
        email: str,
        password_hash: str,
    ) -> UserAccount:
        user = User(
            name=name,
            last_name=last_name,
            email=email,
            password=password_hash,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return UserAccount(
            id=user.id,
            name=user.name,
            last_name=user.last_name,
            email=user.email,
            password_hash=user.password,
        )

    async def assign_role(self, *, user_id: int, role: RoleEnum) -> RoleEnum:
        user_role = UserRoles(role=role, user=user_id)
        self.db.add(user_role)
        await self.db.commit()
        await self.db.refresh(user_role)
        return user_role.role

    async def get_authenticated_user_by_id(
        self, user_id: int
    ) -> AuthenticatedUser | None:
        stmt = (
            select(User, UserRoles.role)
            .outerjoin(UserRoles, UserRoles.user == User.id)
            .where(User.id == user_id)
        )
        result = await self.db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        user, role = row
        return AuthenticatedUser(
            id=user.id,
            name=user.name,
            last_name=user.last_name,
            email=user.email,
            role=role,
        )

    async def delete_pending_invitations_for_email(
        self, *, email: str, role: RoleEnum
    ) -> None:
        stmt = delete(UserInvitationModel).where(
            UserInvitationModel.email == email.lower().strip(),
            UserInvitationModel.role == role,
            UserInvitationModel.accepted_at.is_(None),
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
        invitation = UserInvitationModel(
            email=email.lower().strip(),
            role=role,
            token_hash=token_hash,
            invited_by=invited_by,
            expires_at=expires_at,
        )
        self.db.add(invitation)
        await self.db.commit()
        await self.db.refresh(invitation)
        return UserInvitation(
            id=invitation.id,
            email=invitation.email,
            role=invitation.role,
            token_hash=invitation.token_hash,
            invited_by=invitation.invited_by,
            expires_at=invitation.expires_at,
            accepted_at=invitation.accepted_at,
            created_at=invitation.created_at,
        )

    async def get_active_invitation_by_token_hash(
        self, token_hash: str
    ) -> UserInvitation | None:
        stmt = select(UserInvitationModel).where(
            UserInvitationModel.token_hash == token_hash,
            UserInvitationModel.accepted_at.is_(None),
            UserInvitationModel.expires_at > datetime.now(timezone.utc),
        )
        result = await self.db.execute(stmt)
        invitation = result.scalar_one_or_none()
        if invitation is None:
            return None
        return UserInvitation(
            id=invitation.id,
            email=invitation.email,
            role=invitation.role,
            token_hash=invitation.token_hash,
            invited_by=invitation.invited_by,
            expires_at=invitation.expires_at,
            accepted_at=invitation.accepted_at,
            created_at=invitation.created_at,
        )

    async def mark_invitation_accepted(
        self, invitation_id: int
    ) -> UserInvitation | None:
        invitation = await self.db.get(UserInvitationModel, invitation_id)
        if invitation is None:
            return None
        invitation.accepted_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(invitation)
        return UserInvitation(
            id=invitation.id,
            email=invitation.email,
            role=invitation.role,
            token_hash=invitation.token_hash,
            invited_by=invitation.invited_by,
            expires_at=invitation.expires_at,
            accepted_at=invitation.accepted_at,
            created_at=invitation.created_at,
        )
