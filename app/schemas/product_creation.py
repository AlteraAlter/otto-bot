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


class ProductSpreadsheetImportResponse(BaseModel):
    """Success response for XLSX-to-database imports."""

    success: bool = Field(default=True)
    file_name: str
    imported_rows: int
    upserted_rows: int
    skipped_rows: int
    columns: list[str] = Field(default_factory=list)


class ProductImportTaskDTO(BaseModel):
    id: str
    file_name: str
    status: str
    total_rows: int | None = None
    processed_rows: int = 0
    upserted_rows: int = 0
    skipped_rows: int = 0
    error_message: str | None = None
    created_at: str
    updated_at: str
    started_at: str | None = None
    finished_at: str | None = None


class ProductImportTaskListResponse(BaseModel):
    success: bool = Field(default=True)
    items: list[ProductImportTaskDTO] = Field(default_factory=list)
