"""Pydantic schemas for EAN pool API endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class EanPoolStatus(str, Enum):
    available = "available"
    reserved = "reserved"
    used = "used"
    disabled = "disabled"


class EanPoolItemDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "ean": "4071489219395",
                "status": "available",
                "source": "manual",
                "reservedFor": None,
                "usedFor": None,
                "metadata": {},
                "note": None,
                "createdByUserId": 12,
                "createdAt": "2026-06-29T12:00:00Z",
                "updatedAt": "2026-06-29T12:00:00Z",
                "reservedAt": None,
                "usedAt": None,
            },
        },
    )

    id: int
    ean: str
    status: EanPoolStatus
    source: str | None = None
    reserved_for: str | None = Field(default=None, alias="reservedFor")
    used_for: str | None = Field(default=None, alias="usedFor")
    metadata: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None
    created_by_user_id: int | None = Field(default=None, alias="createdByUserId")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
    reserved_at: datetime | None = Field(default=None, alias="reservedAt")
    used_at: datetime | None = Field(default=None, alias="usedAt")


class EanPoolImportRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "eans": ["4071489219395", "4071489219401"],
                "source": "manual",
                "note": "Batch from supplier sheet",
                "metadata": {},
            },
        },
    )

    eans: list[str] = Field(
        min_length=1,
        description="EAN values to add to the free pool. Non-digit characters are ignored.",
        examples=[["4071489219395", "4071489219401"]],
    )
    source: str | None = Field(
        default="manual",
        description="Where this batch came from, for example manual, csv, or supplier.",
    )
    note: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EanPoolImportResponse(BaseModel):
    success: bool = Field(default=True)
    inserted: int
    skipped: int
    items: list[EanPoolItemDTO] = Field(default_factory=list)


class EanPoolStatsResponse(BaseModel):
    success: bool = Field(default=True)
    available: int = 0
    reserved: int = 0
    used: int = 0
    disabled: int = 0


class EanPoolListResponse(BaseModel):
    success: bool = Field(default=True)
    items: list[EanPoolItemDTO] = Field(default_factory=list)


class EanPoolReserveRequest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "reservedFor": "variant:4071489219395:bezug-textil-farbe-blau",
                "metadata": {},
            },
        },
    )

    reserved_for: str = Field(
        min_length=1,
        alias="reservedFor",
        description="Local identifier that needs a generated-variation EAN.",
        examples=["variant:4071489219395:bezug-textil-farbe-blau"],
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class EanPoolMarkUsedRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    used_for: str = Field(
        min_length=1,
        alias="usedFor",
        description="Final identifier where this EAN was written.",
        examples=["otto-upload:product-123:variant-4"],
    )


class EanPoolItemResponse(BaseModel):
    success: bool = Field(default=True)
    item: EanPoolItemDTO
