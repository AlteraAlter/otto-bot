import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status

from app.repository.user_repository import UserRepository
from app.schemas.tokenDTO import TokenDTO
from app.schemas.userDTO import UserDTO, UserLoginDTO, UserRegisterDTO


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
        if not self.verify_password(password, user.password):
            return None
        return user

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

    async def register_user(self, payload: UserRegisterDTO) -> TokenDTO:
        existing_user = await self.user_repository.select_user_by_email(payload.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            )

        user = await self.user_repository.create_user(
            name=payload.name,
            last_name=payload.last_name,
            email=payload.email,
            password=self.hash_password(payload.password),
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

    async def get_current_user(self, token: str) -> UserDTO:
        payload = self.decode_token(token)
        subject = payload.get("sub")
        if not subject or not str(subject).isdigit():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = await self.user_repository.select_user_by_id(int(subject))
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return UserDTO.model_validate(user)
