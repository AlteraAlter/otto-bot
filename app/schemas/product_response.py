from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.schemas.base_data import Link

class ProductCreateResponse(BaseModel):
    state: str
    total: int
    message: str
    links: list[Link]
    
    model_config = ConfigDict(
        extra="ignore"
    )


class UpdateQuantityResponse(BaseModel):
    
    status_code: int
    message: str
    
    
class UpdateProductDeliveryResponse(BaseModel):
    
    message: str = "OK"


class OperationResult(BaseModel):
    
    success: bool
    errors: str | None = None
    
    
class AvailabilityResponse(BaseModel):
    
    update_quantity: Optional[OperationResult]
    update_delivery: Optional[OperationResult]