from enum import Enum


class FactoryEnum(str, Enum):
    """Фабрики с их значениями"""


class Kind(str, Enum):
    LISTER = "lister"
    PRODUCT = "product"