from openai import AsyncOpenAI


class GPTHelper:
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
