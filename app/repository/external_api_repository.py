from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.external_schemes.until_schemes import ShippingProfileResponse
from app.models.shipping_profile import ShippingProfile


class ExternalApiRepository:
    
    def __init__(self, session: AsyncSession):
        self.session = session
        
        
    async def create_shipping_profile(self, data: ShippingProfileResponse):
        shipping_profiles = [
            ShippingProfile(**payload.model_dump())
            for payload in data.root
        ]
                
        self.session.add_all(shipping_profiles)
        await self.session.commit()
        await self.session.refresh(shipping_profiles)
        return shipping_profiles
