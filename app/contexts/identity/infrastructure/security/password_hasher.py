import base64
import hashlib
import hmac
import secrets


class PBKDF2PasswordHasher:
    def _b64encode(self, value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")

    def _b64decode(self, value: str) -> bytes:
        padding = "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(value + padding)

    def hash(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        derived_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            100_000,
        )
        return f"{self._b64encode(salt)}:{self._b64encode(derived_key)}"

    def verify(self, plain_password: str, password_hash: str) -> bool:
        try:
            salt_b64, hash_b64 = password_hash.split(":", 1)
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
