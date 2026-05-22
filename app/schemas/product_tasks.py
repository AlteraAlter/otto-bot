from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.enums import Controller, ShippingProfileEnum
from app.schemas.product import Product


class ProductTaskCreateItemDTO(BaseModel):
    product: Product
    quantity: int = Field(gt=0)
    shippingProfileID: ShippingProfileEnum
    processingTime: str = "DEFAULT"


class ProductTaskCreateRequestDTO(BaseModel):
    controller: Controller
    items: list[ProductTaskCreateItemDTO]


class ProductTaskItemDTO(BaseModel):
    item_index: int
    sku: str
    product_reference: str
    create_status_ru: str | None = None
    availability_status_ru: str | None = None
    error_message: str | None = None
    payload: dict[str, Any]
    availability_payload: dict[str, Any]


class ProductTaskDTO(BaseModel):
    id: str
    status: str
    controller: Controller
    process_id: str | None = None
    process_state: str | None = None
    total_items: int
    failed_items: int
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None
    items: list[ProductTaskItemDTO] = Field(default_factory=list)


class ProductTaskListResponseDTO(BaseModel):
    success: bool = True
    items: list[ProductTaskDTO] = Field(default_factory=list)
