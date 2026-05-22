"""Afterbuy authentication helpers."""

from __future__ import annotations

import httpx


class AfterbuyAuth:
    """Small HTTP helper responsible only for Afterbuy login."""

    def __init__(
        self,
        *,
        username: str,
        password: str,
        base_url: str,
        timeout: float = 30.0,
    ):
        self.username = username
        self.password = password
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def login_and_get_session(self, client: httpx.AsyncClient) -> str:
        """Authenticate and return the `session` cookie."""
        response = await client.post(
            f"{self.base_url}/auth/login",
            json={
                "username": self.username,
                "password": self.password,
            },
        )
        response.raise_for_status()
        session = response.cookies.get("session") or client.cookies.get("session")
        if not session:
            raise RuntimeError("Aftercool login succeeded but `session` cookie was not found.")
        return session
