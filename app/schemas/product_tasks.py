from pydantic import BaseModel, Field

from app.schemas.enums import Controller


class ProductFactoryCreateRequestDTO(BaseModel):
    controller: Controller
    factory_id: str
    run_id: str | None = None


class ProductFactoryCreateResponseDTO(BaseModel):
    success: bool = True
    run_id: str | None = None
    controller: Controller
    factory_id: str
    source_items: int
    mapped_items: int
    payload_items: int
    issues: list[str] = Field(default_factory=list)
    process_id: str | None = None
    process_state: str | None = None
