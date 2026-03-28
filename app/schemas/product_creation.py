"""Schemas for file-based product preparation/creation API responses."""

from typing import Any

from pydantic import BaseModel, Field


class ProductCreationIssue(BaseModel):
    """Describes one pipeline problem tied to a source item index."""

    index: int = Field(description="0-based index of source item in uploaded JSON")
    stage: str = Field(description="pipeline stage where issue occurred")
    message: str = Field(description="human-readable error description")


class ProductCreationFileResponse(BaseModel):
    """Success response for create-from-file and create-from-prepared endpoints."""

    success: bool = Field(default=True)
    source_items: int
    normalized_items: int
    created_items: int
    skipped_items: int
    issues: list[ProductCreationIssue] = Field(default_factory=list)


class ProductCreationErrorResponse(BaseModel):
    """Error envelope returned by preparation/creation endpoints."""

    success: bool = Field(default=False)
    message: str
    issues: list[ProductCreationIssue] = Field(default_factory=list)


class ProductCreationPrepareResponse(BaseModel):
    """Response for prepare-only endpoint containing validated request bodies."""

    success: bool = Field(default=True)
    source_items: int
    normalized_items: int
    skipped_items: int
    issues: list[ProductCreationIssue] = Field(default_factory=list)
    request_bodies: list[dict[str, Any]] = Field(default_factory=list)


class ProductCreationPreparedRequest(BaseModel):
    """Request schema for the second phase of the two-step creation flow."""

    request_bodies: list[dict[str, Any]] = Field(default_factory=list)
