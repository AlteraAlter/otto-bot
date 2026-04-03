import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from app.contexts.identity.domain.exceptions import TokenExpiredError, TokenValidationError


class JwtTokenIssuer:
    def __init__(self, *, secret_key: str, algorithm: str):
        self.secret_key = secret_key
        self.algorithm = algorithm

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

    def issue(self, *, user_id: int, email: str, expires_delta: timedelta) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "email": email,
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

    def decode(self, token: str) -> dict[str, object]:
        try:
            header_segment, payload_segment, signature_segment = token.split(".")
        except ValueError as exc:
            raise TokenValidationError("Could not validate credentials") from exc

        signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
        expected_signature = self._sign(signing_input)
        try:
            provided_signature = self._b64decode(signature_segment)
            payload = json.loads(self._b64decode(payload_segment))
        except (ValueError, json.JSONDecodeError) as exc:
            raise TokenValidationError("Could not validate credentials") from exc

        if not hmac.compare_digest(expected_signature, provided_signature):
            raise TokenValidationError("Could not validate credentials")

        exp = payload.get("exp")
        if not isinstance(exp, int):
            raise TokenValidationError("Could not validate credentials")
        if datetime.now(timezone.utc).timestamp() >= exp:
            raise TokenExpiredError("Token has expired")
        return payload
