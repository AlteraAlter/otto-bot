"""Authentication helper for OTTO client-credentials token retrieval."""

from typing import Optional
import httpx
import time


class OttoAuth:
    """Cache and refresh OTTO OAuth access tokens for API requests."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        base_url: str,
        scope: str,
        timeout: float,
        xl_client_id: str | None = None,
        xl_client_secret: str | None = None,
    ):
        """Store credentials/configuration and initialize in-memory token cache."""
        self.client_id = client_id
        self.client_secret = client_secret
        self.xl_client_id = xl_client_id or client_id
        self.xl_client_secret = xl_client_secret or client_secret
        self.base_url = base_url
        self.scope = scope
        self.timeout = timeout
        self._tokens: dict[str, str] = {}
        self._expires_at: dict[str, float] = {}

    def _credentials_for_controller(self, controller: str) -> tuple[str, str]:
        if controller.lower() == "xl":
            return self.xl_client_id, self.xl_client_secret
        return self.client_id, self.client_secret

    async def _request_token(self, controller: str) -> str | None:
        """Request a new access token and update cache expiry metadata."""
        client_id, client_secret = self._credentials_for_controller(controller)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/v1/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": self.scope,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        response.raise_for_status()
        data = response.json()

        token = data["access_token"]
        expires_in = int(data.get("expires_in", 300))
        key = controller.lower()
        self._tokens[key] = token
        self._expires_at[key] = time.time() + expires_in - 60

        return token

    async def get_token(self, controller: str = "jv") -> str | None:
        """Return cached token when valid, otherwise fetch a fresh token."""
        key = controller.lower()
        token = self._tokens.get(key)
        expires_at = self._expires_at.get(key, 0)
        if token and time.time() < expires_at:
            return token

        return await self._request_token(controller)
