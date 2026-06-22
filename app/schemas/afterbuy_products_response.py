from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.afterbuy_enums import Kind


class ProductBase(BaseModel):
    Artikelbeschreibung: Optional[str] = None
    Beschreibung: Optional[str] = None
    Description: Optional[str] = None
    TranslatedDescription: Optional[str] = None
    PictureURL: Optional[str] = None
    pictureurls: Optional[str] = None
    CustomItemSpecifics: Optional[str] = None
    I_stammartikel: Optional[str] = None
    Menge: Optional[str] = None
    Startpreis: Optional[str] = None
    Currency: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class ProductFetchResponse(BaseModel):
    products: list[ProductBase]


class FactoryBase(BaseModel):
    account: str
    kind: Kind
    id: Optional[str] = None
    name: Optional[str] = None
    items_count: int

    model_config = ConfigDict(extra="ignore")


class FactoriesFetchResponse(BaseModel):
    factory: list[FactoryBase]
