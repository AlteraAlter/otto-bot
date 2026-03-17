from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from datetime import datetime


class Attribute(BaseModel):
    name: str
    values: List[str]
    additional: bool


class ProductDescription(BaseModel):
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
    type: str
    location: HttpUrl


class MaxOrderQuantity(BaseModel):
    quantity: int
    periodInDays: int


class Order(BaseModel):
    maxOrderQuantity: MaxOrderQuantity


class Price(BaseModel):
    amount: float
    currency: str


class Sale(BaseModel):
    salePrice: Price
    startDate: datetime
    endDate: datetime


class NormPriceInfo(BaseModel):
    normAmount: float
    normUnit: str
    salesAmount: float
    salesUnit: str


class Pricing(BaseModel):
    standardPrice: Price
    vat: str
    msrp: Optional[Price] = None
    sale: Optional[Sale] = None
    normPriceInfo: Optional[NormPriceInfo] = None


class PackingUnit(BaseModel):
    weight: float
    width: float
    height: float
    length: float


class Logistics(BaseModel):
    packingUnitCount: int
    packingUnits: List[PackingUnit]


class Address(BaseModel):
    name: str
    address: str
    regionCode: str
    email: Optional[str] = None
    url: Optional[HttpUrl] = None
    phone: Optional[str] = None
    roles: List[str]
    components: Optional[List[str]] = None


class ProductSafety(BaseModel):
    addresses: List[Address]


class FoodInformation(BaseModel):
    addresses: List[Address]


class Compliance(BaseModel):
    productSafety: Optional[ProductSafety] = None
    foodInformation: Optional[FoodInformation] = None


class ProductCreate(BaseModel):
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
    sku: str
    active: bool


class Status(BaseModel):
    status: List[StatusList]
