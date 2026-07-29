import pytest
from httpx import AsyncClient

from app.schemas.external_schemes.until_schemes import ShippingProfileResponse


@pytest.mark.asyncio
async def test_get_shipping_profile_success(client: AsyncClient):
    response = await client.get(
        "/extermal/shipping_profiles",
        params={"controller": "jv"}
    )
    
    assert response.status_code == 200
    
    data = response.json()
    validated = ShippingProfileResponse.model_validate(data)

    assert isinstance(validated, ShippingProfileResponse)
    assert validated.root    
    assert len(validated.root) != 0 and len(validated.root) <= 300

    
