from pydantic import BaseModel
from typing import TypeVar


def to_json(model: BaseModel) -> dict:
    """
    Функция которая сериализирует в жсон обьекты из схем
    """

    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


T = TypeVar("T", bound=BaseModel)


def parse(model: type[T], data: dict) -> T:
    return model.model_validate(data)
