from datetime import datetime
from typing import Any

import httpx

from app.core.otto_auth import OttoAuth
from app.schemas.external_schemes.until_schemes import (
    CreateOrUpdateProductVariationRequest,
    GetProductRequest,
)

import logging

from app.services.extermal_service import DeliveryInformationRequest, QuantityRequest


logger = logging.getLogger("external_api")


class ExternalOttoClient:

    def __init__(self, auth: OttoAuth, base_url: str):
        self.auth = auth
        self.base_url = base_url


    async def _header(self, controller):
        token = await self.auth.get_token(controller)
        request_timestamp = (
            datetime.now().astimezone().isoformat(timespec="milliseconds")
        )

        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Request-Timestamp": request_timestamp,
        }


    async def get_products(self, payload: GetProductRequest, controller: str):
        header = await self._header(controller)

        async with httpx.AsyncClient() as client:
            logger.info("Отправляется запрос на ОТТО АПИ /v5/products")
            response = await client.get(
                f"{self.base_url}/v5/products",
                headers=header,
                params=payload.model_dump(mode="json", exclude_none=True),
            )

        response.raise_for_status()
        return response.json()


    @staticmethod
    def _parse_response(response: httpx.Response):
        if response.status_code == 204 or not response.content:
            return {"status_code": response.status_code, "message": "No content"}

        content_type = response.headers.get("content-type", "").lower()
        if "application/json" in content_type:
            return response.json()

        return {
            "status_code": response.status_code,
            "content_type": content_type or None,
            "body": response.text,
        }


    async def update_active_status(self, payload: dict, controller: str):
        header = await self._header(controller)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v5/products/active-status",
                headers=header,
                json=payload,
            )

        return response.status_code, self._parse_response(response)


    async def create_or_update_product(
        self,
        payload: CreateOrUpdateProductVariationRequest | list[dict[str, Any]],
        controller: str,
    ) -> dict[str, Any]:
        header = await self._header(controller)
        json_payload = (
            payload.model_dump(mode="json", by_alias=True, exclude_none=True)
            if isinstance(payload, CreateOrUpdateProductVariationRequest)
            else payload
        )

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v5/products", headers=header, json=json_payload
            )

        response.raise_for_status()
        return response.json()


    async def update_quantity(
        self,
        payload: QuantityRequest,
        controller: str
    ):
        header = await self._header(controller)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v1/availability/quantities",
                headers=header,
                json=payload.model_dump()
            )
        response.raise_for_status()
        return response.json()


    async def update_product_delivery(
        self,
        payload: DeliveryInformationRequest,
        controller
    ):
        header = await self._header(controller)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v1/availability/product-delivery-information",
                headers=header,
                json=payload.model_dump()
            )
        response.raise_for_status()
        return response.json()


    async def get_shipping_profiles(self, controller: str):
        header = await self._header(controller)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v1/shipping-profiles", headers=header
            )
        response.raise_for_status()
        return response.json()


    async def get_categories(self, payload: dict, controller: str):
        header = await self._header(controller)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v5/products/categories",
                headers=header,
                params=payload,
            )
        response.raise_for_status()
        return response.json()
