import base64
import hashlib
import hmac
import json
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any
from urllib.parse import urlencode

from fastapi import HTTPException, status

from app.core.configs import settings
from app.schemas.enums import RoleEnum
from app.repository.user_repository import UserRepository
from app.schemas.tokenDTO import TokenDTO
from app.schemas.userDTO import (
    AdminUserCreateDTO,
    AdminUserCreateResponseDTO,
    EmployeeInviteRequestDTO,
    EmployeeInviteResponseDTO,
    UserDTO,
    UserLoginDTO,
    UserRegisterDTO,
)


class UserAuth:
    def __init__(
        self,
        *,
        user_repository: UserRepository,
        secret_key: str,
        algorithm: str,
        access_token_expire_minutes: int,
    ):
        self.user_repository = user_repository
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes

    def _b64encode(self, value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")

    def _b64decode(self, value: str) -> bytes:
        padding = "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(value + padding)

    def _sign(self, signing_input: bytes) -> bytes:
        if self.algorithm != "HS256":
            raise ValueError(f"Unsupported JWT algorithm: {self.algorithm}")
        return hmac.new(
            self.secret_key.encode("utf-8"),
            signing_input,
            hashlib.sha256,
        ).digest()

    def _hash_invitation_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _build_invitation_link(self, *, email: str, token: str) -> str:
        base = settings.frontend_app_url.rstrip("/")
        return f"{base}/register?{urlencode({'email': email, 'invite': token})}"

    def _send_employee_invitation_email(
        self,
        *,
        recipient_email: str,
        invitation_link: str,
        invitation_code: str,
        expires_at: datetime,
    ) -> None:
        if (
            not settings.smtp_host
            or not settings.smtp_username
            or not settings.smtp_password
            or not settings.smtp_sender_email
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="SMTP settings are not configured for invitation emails",
            )

        message = EmailMessage()
        message["Subject"] = "Your OTTO employee invitation"
        message["From"] = settings.smtp_sender_email
        message["To"] = recipient_email
        message.set_content(
            "\n".join(
                [
                    "You have been invited to create an OTTO employee account.",
                    "",
                    f"Complete registration here: {invitation_link}",
                    f"Invitation code: {invitation_code}",
                    "If the link does not open correctly, copy the code and paste it into the registration form.",
                    f"Invitation expires at: {expires_at.isoformat()}",
                    "",
                    "If you did not expect this email, you can ignore it.",
                ]
            )
        )

        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to send invitation email: {exc}",
            ) from exc

    def hash_password(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        derived_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            100_000,
        )
        return f"{self._b64encode(salt)}:{self._b64encode(derived_key)}"

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        try:
            salt_b64, hash_b64 = hashed_password.split(":", 1)
            salt = self._b64decode(salt_b64)
            expected_hash = self._b64decode(hash_b64)
        except (TypeError, ValueError):
            return False

        provided_hash = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt,
            100_000,
        )
        return hmac.compare_digest(provided_hash, expected_hash)

    def create_access_token(
        self, data: dict[str, Any], expires_delta: timedelta
    ) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            **data,
            "exp": int((now + expires_delta).timestamp()),
            "iat": int(now.timestamp()),
        }
        header = {"alg": self.algorithm, "typ": "JWT"}
        header_segment = self._b64encode(
            json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        payload_segment = self._b64encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
        signature = self._b64encode(self._sign(signing_input))
        return f"{header_segment}.{payload_segment}.{signature}"

    def decode_token(self, token: str) -> dict[str, Any]:
        
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

        try:
            header_segment, payload_segment, signature_segment = token.split(".")
        except ValueError as exc:
            raise credentials_exception from exc

        signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
        expected_signature = self._sign(signing_input)
        try:
            provided_signature = self._b64decode(signature_segment)
            payload = json.loads(self._b64decode(payload_segment))
        except (ValueError, json.JSONDecodeError) as exc:
            raise credentials_exception from exc

        if not hmac.compare_digest(expected_signature, provided_signature):
            raise credentials_exception

        exp = payload.get("exp")
        if not isinstance(exp, int):
            raise credentials_exception
        if datetime.now(timezone.utc).timestamp() >= exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload

    async def validate_user(self, email: str, password: str):
        user = await self.user_repository.select_user_by_email(email)
        if not user:
            return None
        return user if self.verify_password(password, user.password) else None

    async def login_for_access_token(self, credentials: UserLoginDTO) -> TokenDTO:
        user = await self.validate_user(credentials.email, credentials.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect user credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token_expires = timedelta(minutes=self.access_token_expire_minutes)
        access_token = self.create_access_token(
            data={"sub": str(user.id), "email": user.email},
            expires_delta=access_token_expires,
        )
        return TokenDTO(
            access_token=access_token,
            token_type="bearer",
            expires_in=int(access_token_expires.total_seconds()),
        )

    async def _create_user_account(
        self,
        *,
        name: str,
        last_name: str,
        email: str,
        password: str,
        role: RoleEnum,
    ) -> UserDTO:
        normalized_email = email.lower().strip()
        existing_user = await self.user_repository.select_user_by_email(normalized_email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            )

        user = await self.user_repository.create_user(
            name=name,
            last_name=last_name,
            email=normalized_email,
            password=self.hash_password(password),
        )
        assigned_role = await self.user_repository.assign_role(user_id=user.id, role=role)

        return UserDTO.model_validate(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "last_name": user.last_name,
                "role": assigned_role.role,
            }
        )

    def _issue_token_for_user(self, user: UserDTO) -> TokenDTO:
        access_token_expires = timedelta(minutes=self.access_token_expire_minutes)
        access_token = self.create_access_token(
            data={"sub": str(user.id), "email": user.email},
            expires_delta=access_token_expires,
        )
        return TokenDTO(
            access_token=access_token,
            token_type="bearer",
            expires_in=int(access_token_expires.total_seconds()),
        )

    async def register_user(self, payload: UserRegisterDTO) -> TokenDTO:
        invitation = await self.user_repository.select_active_invitation_by_token_hash(
            self._hash_invitation_token(payload.invite_token)
        )
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invitation is invalid, expired, or already used",
            )
        if invitation.email.lower().strip() != payload.email.lower().strip():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invitation email does not match the registration email",
            )

        user = await self._create_user_account(
            name=payload.name,
            last_name=payload.last_name,
            email=payload.email,
            password=payload.password,
            role=invitation.role,
        )
        await self.user_repository.mark_invitation_accepted(invitation.id)
        return self._issue_token_for_user(user)

    async def invite_employee(
        self,
        payload: EmployeeInviteRequestDTO,
        *,
        invited_by_user_id: int,
    ) -> EmployeeInviteResponseDTO:
        existing_user = await self.user_repository.select_user_by_email(payload.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists",
            )

        await self.user_repository.delete_pending_invitations_for_email(
            email=payload.email,
            role=RoleEnum.EMPLOYEE,
        )

        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=settings.employee_invitation_expire_hours
        )
        invitation = await self.user_repository.create_invitation(
            email=payload.email,
            role=RoleEnum.EMPLOYEE,
            token_hash=self._hash_invitation_token(raw_token),
            invited_by=invited_by_user_id,
            expires_at=expires_at,
        )
        invitation_link = self._build_invitation_link(
            email=payload.email,
            token=raw_token,
        )
        self._send_employee_invitation_email(
            recipient_email=payload.email,
            invitation_link=invitation_link,
            invitation_code=raw_token,
            expires_at=expires_at,
        )

        return EmployeeInviteResponseDTO(
            success=True,
            email=invitation.email,
            role=invitation.role,
            expires_at=invitation.expires_at,
        )

    async def admin_create_user(
        self, payload: AdminUserCreateDTO
    ) -> AdminUserCreateResponseDTO:
        user = await self._create_user_account(
            name=payload.name,
            last_name=payload.last_name,
            email=payload.email,
            password=payload.password,
            role=payload.role,
        )
        return AdminUserCreateResponseDTO(success=True, user=user)

    async def get_current_user(self, token: str) -> UserDTO:
        payload = self.decode_token(token)
        subject = payload.get("sub")
        if not subject or not str(subject).isdigit():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_with_role = await self.user_repository.select_user_with_role_by_id(
            int(subject)
        )
        if not user_with_role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user, role = user_with_role
        return UserDTO.model_validate(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "last_name": user.last_name,
                "role": role,
            }
        )
