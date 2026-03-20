from enum import Enum


class SortOrderEnum(str, Enum):
    ASC = "ASC"
    DESC = "DESC"


class VatEnum(str, Enum):
    FULL = "FULL"
    REDUCED = "REDUCED"
    FREE = "FREE"
    NONE = "NONE"
