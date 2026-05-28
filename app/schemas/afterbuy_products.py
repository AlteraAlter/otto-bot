from pydantic import BaseModel
from typing import Any, Optional


class FactoryBase(BaseModel):
    account: str
    kind: str
    id: str
    item_count: int


class FactoryRequest(BaseModel):
    pass
