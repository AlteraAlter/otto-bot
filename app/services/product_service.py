from app.clients.otto_client import OttoClient


class ProductService:
    def __init__(self, client: OttoClient):
        self.client = client

    async def get_products(self, payload: dict):
        return await self.client.get_products(payload)
    
    async def get_active_products(self, payload: dict):
        return await self.client.get_active_products(payload)
