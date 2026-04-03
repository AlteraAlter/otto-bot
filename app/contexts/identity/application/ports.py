from datetime import datetime, timedelta
from typing import Protocol

from app.contexts.identity.domain.entities import (
    AuthenticatedUser,
    UserAccount,
    UserInvitation,
)
from app.schemas.enums import RoleEnum


class UserAccountRepository(Protocol):
    async def get_by_email(self, email: str) -> UserAccount | None: ...

    async def create_user(
        self,
        *,
        name: str,
        last_name: str,
        email: str,
        password_hash: str,
    ) -> UserAccount: ...

    async def assign_role(self, *, user_id: int, role: RoleEnum) -> RoleEnum: ...

    async def get_authenticated_user_by_id(
        self, user_id: int
    ) -> AuthenticatedUser | None: ...

    async def delete_pending_invitations_for_email(
        self, *, email: str, role: RoleEnum
    ) -> None: ...

    async def create_invitation(
        self,
        *,
        email: str,
        role: RoleEnum,
        token_hash: str,
        invited_by: int | None,
        expires_at: datetime,
    ) -> UserInvitation: ...

    async def get_active_invitation_by_token_hash(
        self, token_hash: str
    ) -> UserInvitation | None: ...

    async def mark_invitation_accepted(
        self, invitation_id: int
    ) -> UserInvitation | None: ...


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, plain_password: str, password_hash: str) -> bool: ...


class TokenIssuer(Protocol):
    def issue(self, *, user_id: int, email: str, expires_delta: timedelta) -> str: ...

    def decode(self, token: str) -> dict[str, object]: ...


class InvitationMailer(Protocol):
    def send_employee_invitation(
        self,
        *,
        recipient_email: str,
        invitation_code: str,
        expires_at: datetime,
    ) -> None: ...
