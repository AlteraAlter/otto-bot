"""Schemas for product error responses and XLSX import tasks."""

from pydantic import BaseModel, Field


class ProductCreationIssue(BaseModel):
    """Describes one pipeline problem tied to a source item index."""

    index: int = Field(description="0-based index of source item")
    stage: str = Field(description="pipeline stage where issue occurred")
    message: str = Field(description="human-readable error description")


class ProductCreationErrorResponse(BaseModel):
    """Error envelope returned by product and import endpoints."""

    success: bool = Field(default=False)
    message: str
    issues: list[ProductCreationIssue] = Field(default_factory=list)


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
