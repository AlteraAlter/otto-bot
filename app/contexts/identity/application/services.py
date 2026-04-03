import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.contexts.identity.application.commands import (
    CreateUserCommand,
    InviteEmployeeCommand,
    LoginCommand,
    RegisterEmployeeCommand,
)
from app.contexts.identity.application.dto import (
    CreateUserResult,
    InviteEmployeeResult,
    IssuedToken,
)
from app.contexts.identity.application.ports import (
    InvitationMailer,
    PasswordHasher,
    TokenIssuer,
    UserAccountRepository,
)
from app.contexts.identity.domain.entities import AuthenticatedUser
from app.contexts.identity.domain.exceptions import (
    InvalidCredentialsError,
    InvitationEmailMismatchError,
    InvitationInvalidError,
    UserAlreadyExistsError,
    UserNotFoundError,
)
from app.schemas.enums import RoleEnum


class IdentityService:
    def __init__(
        self,
        *,
        repository: UserAccountRepository,
        password_hasher: PasswordHasher,
        token_issuer: TokenIssuer,
        invitation_mailer: InvitationMailer,
        access_token_expire_minutes: int,
        invitation_expire_hours: int,
    ):
        self.repository = repository
        self.password_hasher = password_hasher
        self.token_issuer = token_issuer
        self.invitation_mailer = invitation_mailer
        self.access_token_expire_minutes = access_token_expire_minutes
        self.invitation_expire_hours = invitation_expire_hours

    def _hash_invitation_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    async def _create_user(
        self,
        *,
        name: str,
        last_name: str,
        email: str,
        password: str,
        role: RoleEnum,
    ) -> AuthenticatedUser:
        normalized_email = email.lower().strip()
        existing_user = await self.repository.get_by_email(normalized_email)
        if existing_user:
            raise UserAlreadyExistsError("User with this email already exists")

        user = await self.repository.create_user(
            name=name,
            last_name=last_name,
            email=normalized_email,
            password_hash=self.password_hasher.hash(password),
        )
        assigned_role = await self.repository.assign_role(user_id=user.id, role=role)
        return AuthenticatedUser(
            id=user.id,
            name=user.name,
            last_name=user.last_name,
            email=user.email,
            role=assigned_role,
        )

    def _issue_token(self, user: AuthenticatedUser) -> IssuedToken:
        expires_delta = timedelta(minutes=self.access_token_expire_minutes)
        token = self.token_issuer.issue(
            user_id=user.id,
            email=user.email,
            expires_delta=expires_delta,
        )
        return IssuedToken(
            access_token=token,
            token_type="bearer",
            expires_in=int(expires_delta.total_seconds()),
        )

    async def login(self, command: LoginCommand) -> IssuedToken:
        user = await self.repository.get_by_email(command.email)
        if not user or not self.password_hasher.verify(
            command.password, user.password_hash
        ):
            raise InvalidCredentialsError("Incorrect user credentials")

        authenticated = await self.repository.get_authenticated_user_by_id(user.id)
        if not authenticated:
            raise UserNotFoundError("User not found")
        return self._issue_token(authenticated)

    async def register_employee(self, command: RegisterEmployeeCommand) -> IssuedToken:
        invitation = await self.repository.get_active_invitation_by_token_hash(
            self._hash_invitation_token(command.invite_token)
        )
        if not invitation:
            raise InvitationInvalidError(
                "Invitation is invalid, expired, or already used"
            )
        if invitation.email.lower().strip() != command.email.lower().strip():
            raise InvitationEmailMismatchError(
                "Invitation email does not match the registration email"
            )

        user = await self._create_user(
            name=command.name,
            last_name=command.last_name,
            email=command.email,
            password=command.password,
            role=invitation.role,
        )
        await self.repository.mark_invitation_accepted(invitation.id)
        return self._issue_token(user)

    async def invite_employee(
        self, command: InviteEmployeeCommand
    ) -> InviteEmployeeResult:
        existing_user = await self.repository.get_by_email(command.email)
        if existing_user:
            raise UserAlreadyExistsError("A user with this email already exists")

        await self.repository.delete_pending_invitations_for_email(
            email=command.email,
            role=RoleEnum.EMPLOYEE,
        )

        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=self.invitation_expire_hours
        )
        invitation = await self.repository.create_invitation(
            email=command.email,
            role=RoleEnum.EMPLOYEE,
            token_hash=self._hash_invitation_token(raw_token),
            invited_by=command.invited_by_user_id,
            expires_at=expires_at,
        )
        self.invitation_mailer.send_employee_invitation(
            recipient_email=command.email,
            invitation_code=raw_token,
            expires_at=expires_at,
        )
        return InviteEmployeeResult(
            success=True,
            email=invitation.email,
            role=invitation.role,
            expires_at=invitation.expires_at,
        )

    async def create_user(self, command: CreateUserCommand) -> CreateUserResult:
        user = await self._create_user(
            name=command.name,
            last_name=command.last_name,
            email=command.email,
            password=command.password,
            role=command.role,
        )
        return CreateUserResult(success=True, user=user)

    async def get_current_user(self, token: str) -> AuthenticatedUser:
        payload = self.token_issuer.decode(token)
        subject = payload.get("sub")
        if not subject or not str(subject).isdigit():
            raise UserNotFoundError("Could not validate credentials")

        user = await self.repository.get_authenticated_user_by_id(int(subject))
        if not user:
            raise UserNotFoundError("User not found")
        return user
