from typing import Optional
import httpx
import time


class OttoAuth:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        base_url: str,
        scope: str,
        timeout: float,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url
        self.scope = scope
        self.timeout = timeout
        self._token: Optional[str] = None
        self._expires_at: float = 0

    async def _request_token(self) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/v1/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": self.scope,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        response.raise_for_status()
        data = response.json()

        self._token = data["access_token"]
        expires_in = int(data.get("expires_in", 300))
        self._expires_at = time.time() + expires_in - 60

        return self._token

    async def get_token(self) -> str:
        if self._token and time.time() < self._expires_at:
            return self._token

        return await self._request_token()
