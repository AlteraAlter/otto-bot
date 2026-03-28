"""Shared enum types used across schema, model, and route layers."""

from enum import Enum


class SortOrderEnum(str, Enum):
    """Ordering direction used by list and status query endpoints."""

    ASC = "ASC"
    DESC = "DESC"


class VatEnum(str, Enum):
    """Supported VAT categories accepted by OTTO/local product models."""

    FULL = "FULL"
    REDUCED = "REDUCED"
    FREE = "FREE"
    NONE = "NONE"
