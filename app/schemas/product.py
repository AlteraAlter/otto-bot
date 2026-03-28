"""Pydantic models for OTTO product payloads.

These schemas describe the canonical request body shape used when creating or
updating products through OTTO APIs.
"""

from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from datetime import datetime


class Attribute(BaseModel):
    """Single product attribute with one or more textual values."""

    name: str
    values: List[str]
    additional: bool


class ProductDescription(BaseModel):
    """Core merchandising details shown on product detail pages."""

    category: str
    brandId: str
    productLine: Optional[str] = None
    productionDate: Optional[datetime] = None
    multiPack: bool
    bundle: bool
    fscCertified: bool
    disposal: bool
    productUrl: Optional[HttpUrl] = None
    description: Optional[str] = None
    bulletPoints: List[str]
    attributes: List[Attribute]


class MediaAsset(BaseModel):
    """Image or media resource attached to a product."""

    type: str
    location: HttpUrl


class MaxOrderQuantity(BaseModel):
    """Maximum purchasable quantity in a time window."""

    quantity: int
    periodInDays: int


class Order(BaseModel):
    """Order constraints for a product."""

    maxOrderQuantity: MaxOrderQuantity


class Price(BaseModel):
    """Monetary amount with ISO-like currency code."""

    amount: float
    currency: str


class Sale(BaseModel):
    """Sale window and discounted price information."""

    salePrice: Price
    startDate: datetime
    endDate: datetime


class NormPriceInfo(BaseModel):
    """Normalized unit-pricing metadata used for price transparency."""

    normAmount: float
    normUnit: str
    salesAmount: float
    salesUnit: str


class Pricing(BaseModel):
    """Complete pricing object including VAT and optional MSRP/sale details."""

    standardPrice: Price
    vat: str
    msrp: Optional[Price] = None
    sale: Optional[Sale] = None
    normPriceInfo: Optional[NormPriceInfo] = None


class PackingUnit(BaseModel):
    """Physical dimensions and weight for one packaging unit."""

    weight: float
    width: float
    height: float
    length: float


class Logistics(BaseModel):
    """Shipping/logistics information for product fulfillment."""

    packingUnitCount: int
    packingUnits: List[PackingUnit]


class Address(BaseModel):
    """Contact/compliance address record used in safety or food sections."""

    name: str
    address: str
    regionCode: str
    email: Optional[str] = None
    url: Optional[HttpUrl] = None
    phone: Optional[str] = None
    roles: List[str]
    components: Optional[List[str]] = None


class ProductSafety(BaseModel):
    """Compliance block for product safety contact addresses."""

    addresses: List[Address]


class FoodInformation(BaseModel):
    """Compliance block for food information contact addresses."""

    addresses: List[Address]


class Compliance(BaseModel):
    """Optional compliance container for safety and food declarations."""

    productSafety: Optional[ProductSafety] = None
    foodInformation: Optional[FoodInformation] = None


class ProductCreate(BaseModel):
    """Top-level product create/update payload sent to OTTO."""

    productReference: str
    sku: str
    ean: Optional[str] = None
    pzn: Optional[str] = None
    mpn: Optional[str] = None
    moin: Optional[str] = None
    releaseDate: Optional[datetime] = None
    productDescription: ProductDescription
    mediaAssets: List[MediaAsset]
    order: Optional[Order] = None
    pricing: Pricing
    logistics: Logistics
    compliance: Optional[Compliance] = None


class StatusList(BaseModel):
    """SKU-level active status toggle entry."""

    sku: str
    active: bool


class Status(BaseModel):
    """Batch status update payload."""

    status: List[StatusList]
