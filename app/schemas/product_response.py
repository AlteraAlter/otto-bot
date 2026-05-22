from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.schemas.base_data import Link


class ProductCreateResponse(BaseModel):
    state: str
    total: int
    message: str
    links: list[Link]

    model_config = ConfigDict(extra="ignore")


class UpdateQuantityResponse(BaseModel):

    status_code: int
    message: str


class UpdateProductDeliveryResponse(BaseModel):

    message: str = "OK"


class OperationResult(BaseModel):

    success: bool = False
    errors: Optional[str] = None


class AvailabilityResponse(BaseModel):

    update_quantity: Optional[OperationResult]
    update_delivery: Optional[OperationResult]


class DeleteProductResponse(BaseModel):

    product_operation: Optional[OperationResult] = None
    quantity_operation: Optional[OperationResult] = None


class UrlProcessResult(BaseModel):

    url: str
    success: bool
    sku: str | None = None
    message: str


class DeleteProductFrmFileResponse(BaseModel):

    update_product: OperationResult
    update_quantity: OperationResult
