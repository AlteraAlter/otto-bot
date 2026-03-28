"""Enum for possible marketplace publication states of a product."""

from enum import Enum


class MarketPlaceStatus(str, Enum):
    """Lifecycle states reported by OTTO marketplace status endpoint."""

    PENDING = "PENDING"
    ONLINE = "ONLINE"
    RESTRICTED = "RESTRICTED"
    REJECTED = "REJECTED"
    INACTIVE = "INACTIVE"
