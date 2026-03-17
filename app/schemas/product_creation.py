from typing import Any

from pydantic import BaseModel, Field


class ProductCreationIssue(BaseModel):
    index: int = Field(description="0-based index of source item in uploaded JSON")
    stage: str = Field(description="pipeline stage where issue occurred")
    message: str = Field(description="human-readable error description")


class ProductCreationFileResponse(BaseModel):
    success: bool = Field(default=True)
    source_items: int
    normalized_items: int
    created_items: int
    skipped_items: int
    issues: list[ProductCreationIssue] = Field(default_factory=list)


class ProductCreationErrorResponse(BaseModel):
    success: bool = Field(default=False)
    message: str
    issues: list[ProductCreationIssue] = Field(default_factory=list)


class ProductCreationPrepareResponse(BaseModel):
    success: bool = Field(default=True)
    source_items: int
    normalized_items: int
    skipped_items: int
    issues: list[ProductCreationIssue] = Field(default_factory=list)
    request_bodies: list[dict[str, Any]] = Field(default_factory=list)


class ProductCreationPreparedRequest(BaseModel):
    request_bodies: list[dict[str, Any]] = Field(default_factory=list)
