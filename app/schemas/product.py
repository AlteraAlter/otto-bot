"""Pydantic models for OTTO product payloads.

These schemas describe the canonical request body shape used when creating or
updating products through OTTO APIs.
"""

from pydantic import BaseModel, HttpUrl, RootModel, ConfigDict
from typing import List, Optional
from datetime import datetime

from app.schemas.enums import ShippingProfileEnum, Controller


class Attribute(BaseModel):
    """Single product attribute with one or more textual values."""

    name: str
    values: List[str]
    additional: bool = True


class ProductDescription(BaseModel):
    """Core merchandising details shown on product detail pages."""

    productLine: Optional[str] = None
    brandId: str
    bundle: bool = False
    category: str
    disposal: bool = False
    multiPack: bool = False
    fscCertified: bool = False
    bulletPoints: List[str]
    attributes: List[Attribute]
    description: Optional[str] = None
    productUrl: Optional[HttpUrl] = None


class MediaAsset(BaseModel):
    """Image or media resource attached to a product."""

    type: str = "IMAGE"
    location: HttpUrl


class MaxOrderQuantity(BaseModel):
    """Maximum purchasable quantity in a time window."""

    quantity: int = 0
    periodInDays: int = 0


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
    endDate: datetime
    startDate: datetime


class NormPriceInfo(BaseModel):
    """Normalized unit-pricing metadata used for price transparency."""

    normUnit: str
    salesUnit: str
    normAmount: float
    salesAmount: float


class Pricing(BaseModel):
    """Complete pricing object including VAT and optional MSRP/sale details."""

    standardPrice: Price
    vat: str
    # sale: Optional[Sale] = None
    # msrp: Optional[Price] = None
    # normPriceInfo: Optional[NormPriceInfo] = None


class PackingUnit(BaseModel):
    """Physical dimensions and weight for one packaging unit."""

    width: float = 0
    weight: float = 0
    height: float = 0
    length: float = 0


class Logistics(BaseModel):
    """Shipping/logistics information for product fulfillment."""

    packingUnitCount: int = 0
    packingUnits: List[PackingUnit]


class Address(BaseModel):
    name: str
    address: str
    regionCode: str = "DE"
    roles: list[str] = ["DISTRIBUTOR"]
    email: str
    phone: str
    url: HttpUrl
    components: list[str] = []


class ProductSafety(BaseModel):
    """Compliance block for product safety contact addresses."""

    addresses: list[Address]


class Compliance(BaseModel):
    """Optional compliance container for safety and food declarations."""

    productSafety: Optional[ProductSafety] = None


#   ==GET PRODUCT SCHEMAS==
class ProductGet(BaseModel):
    """Product get schema"""

    productReference: str
    sku: str
    ean: str
    productDescription: ProductDescription
    mediaAssets: list[MediaAsset]
    pricing: Pricing
    order: Optional[Order] = None
    logistics: Optional[Logistics] = None

    model_config = ConfigDict(extra="ignore")


class ProductResponse(BaseModel):
    productVariations: list[ProductGet]


# POST
class Product(BaseModel):
    """Top-level product create/update payload sent to OTTO."""

    productReference: str
    sku: str
    ean: Optional[str] = None
    productDescription: ProductDescription
    pricing: Pricing
    mediaAssets: List[MediaAsset]

    model_config = ConfigDict(extra="ignore")


# POST
class ProductClient(BaseModel):
    productReference: str
    sku: str
    ean: Optional[str] = None
    productDescription: ProductDescription
    pricing: Pricing
    mediaAssets: List[MediaAsset]
    compliance: Optional[Compliance] = None


# POST
class ProductBase(RootModel[list[ProductClient]]):
    pass


# POST
class CreateProductRequest(BaseModel):
    controller: Controller
    products: list[Product]


class StatusList(BaseModel):
    """SKU-level active status toggle entry."""

    sku: str
    active: bool


class Status(BaseModel):
    """Batch status update payload."""

    status: List[StatusList]


class UpdateQuantity(BaseModel):

    sku: str
    quantity: str


class UpdateQuantityRequest(BaseModel):

    list[UpdateQuantity]
    controller: Controller = Controller.JV


class UpdateProductDelivery(BaseModel):

    sku: str
    processingTime: str = "DEFAULT"
    shippingProfileId: ShippingProfileEnum


class Availability(BaseModel):
    sku: str
    quantity: str
    shippingProfileID: ShippingProfileEnum
    processingTime: str = "DEFAULT"
    controller: Controller = Controller.JV


class AvailabilityRequest(BaseModel):
    availability: list[Availability]
    controller: Controller = Controller.JV
