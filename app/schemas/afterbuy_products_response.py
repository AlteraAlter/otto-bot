from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.afterbuy_enums import Kind


class ProductBase(BaseModel):
    Artikelbeschreibung: str | None = None
    Description: str | None = None
    TranslatedDescription: str | None = None
    PictureURL: str | None = None
    pictureurls: str | None = None
    CustomItemSpecifics: str | None = None
    Menge: str | None = None
    Startpreis: str | None = None
    Currency: str | None = None

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
