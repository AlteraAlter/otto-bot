from pydantic import BaseModel, ConfigDict
from typing import Any, Optional
from app.schemas.afterbuy_enums import Kind

class FactoryBase(BaseModel):
    account: str
    kind: Optional[Kind] = None
    id: Optional[str] = None
    name: Optional[str] = None
    items_count: int
    
    model_config = ConfigDict(extra="ignore")
    

class FactoriesFetchResponse(BaseModel):
    factory: list[FactoryBase]
    