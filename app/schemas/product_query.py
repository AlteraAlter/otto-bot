from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.marketplaceStatus import MarketPlaceStatus
from app.schemas.sortOrder import SortOrder


def _normalize_category(payload: dict) -> dict:
    category = payload.get("category")
    if isinstance(category, str):
        cleaned = category.strip()
        if cleaned:
            payload["category"] = cleaned.capitalize()
    return payload


class ProductListQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page: int = Field(default=0, ge=0)
    sku: Optional[str] = None
    limit: int = Field(default=100, ge=10, le=100)
    product_reference: Optional[str] = Field(default=None, alias="productReference")
    category: Optional[str] = None
    brand_id: Optional[str] = Field(default=None, alias="brandId")

    def to_payload(self) -> dict:
        payload = self.model_dump(by_alias=True, exclude_none=True)
        return _normalize_category(payload)


class MarketplaceStatusQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sku: Optional[str] = None
    product_reference: Optional[str] = Field(default=None, alias="productReference")
    category: Optional[str] = None
    brand_id: Optional[str] = Field(default=None, alias="brandId")
    from_date: Optional[str] = Field(default=None, alias="fromDate")
    page: int = Field(default=0, ge=0)
    limit: int = Field(default=10, ge=10, le=100)
    market_place_status: Optional[List[MarketPlaceStatus]] = Field(
        default=None, alias="marketPlaceStatus"
    )
    sort_order: SortOrder = Field(default=SortOrder.DESC, alias="sortOrder")

    def to_payload(self) -> dict:
        payload = self.model_dump(by_alias=True, exclude_none=True)
        _normalize_category(payload)
        if "marketPlaceStatus" in payload:
            payload["marketPlaceStatus"] = [
                status.value for status in payload["marketPlaceStatus"]
            ]
        payload["sortOrder"] = self.sort_order.value
        return payload


class CategoryQuery(BaseModel):
    page: int = Field(0, ge=0)
    limit: int = Field(10, ge=10, le=2000)
    category: Optional[str] = Field(None)

    def to_payload(self) -> dict:
        payload = self.model_dump(by_alias=True, exclude_none=True)
        return _normalize_category(payload)
