import httpx

from app.core.otto_auth import OttoAuth


class OttoClient:
    def __init__(self, auth: OttoAuth, base_url: str, timeout: float):
        self.auth = auth
        self.base_url = base_url
        self.timeout = timeout

    async def _header(self):
        token = await self.auth.get_token()
        print(token)
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def get_products(self, payload: dict | None = None):
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/v5/products",
                headers=await self._header(),
                params=payload
            )

            response.raise_for_status()
            return response.json()
        
    async def get_active_products(self, payload: dict | None = None):
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/v5/products/active-status",
                headers=await self._header(),
                params=payload,
            )
            
            response.raise_for_status()
            return response.json()