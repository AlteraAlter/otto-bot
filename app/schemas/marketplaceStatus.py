from enum import Enum


class MarketPlaceStatus(str, Enum):
    PENDING = "PENDING"
    ONLINE = "ONLINE"
    RESTRICTED = "RESTRICTED"
    REJECTED = "REJECTED"
    INACTIVE = "INACTIVE"
