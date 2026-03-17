from app.clients.otto_client import OttoClient


class ProductService:
    def __init__(self, client: OttoClient):
        self.client = client

    async def get_product(self, sku: str):
        return await self.client.get_product(sku)

    async def get_products(self, payload: dict):
        return await self.client.get_products(payload)

    async def get_active_products(self, payload: dict):
        return await self.client.get_active_products(payload)

    async def update_tasks(self, pid: str):
        return await self.client.update_tasks(pid)

    async def get_marketplace_status(self, payload: dict):
        return await self.client.get_marketplace_status(payload)

    async def create_or_update_products(self, payload: dict):
        return await self.client.create_or_update_products(payload)
    
    async def update_status(self, payload: dict):
        return await self.client.update_status(payload)
    
    async def get_categories(self, payload: dict):
        return await self.client.get_categories(payload)
