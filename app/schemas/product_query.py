"""Typed query builders used by product mapping helpers."""

from typing import Optional

from pydantic import BaseModel, Field


def _normalize_category(payload: dict) -> dict:
    """Trim category value while preserving upstream-sensitive casing."""
    category = payload.get("category")
    if isinstance(category, str):
        cleaned = category.strip()
        if cleaned:
            payload["category"] = cleaned
    return payload


class CategoryQuery(BaseModel):
    """Query parameters for fetching category lists from upstream service."""

    page: int = Field(0, ge=0)
    limit: int = Field(1, ge=0, le=2000)
    category: Optional[str] = Field(None)

    def to_payload(self) -> dict:
        """Serialize model to payload while normalizing category formatting."""
        payload = self.model_dump(by_alias=True, exclude_none=True)
        return _normalize_category(payload)
