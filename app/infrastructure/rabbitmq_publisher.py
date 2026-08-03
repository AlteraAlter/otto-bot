import json
from typing import Any

import aio_pika
from aio_pika import RobustConnection
from aio_pika.abc import (
    AbstractRobustChannel,
)
from pydantic import BaseModel


class RabbitMQPublisher:
    
    def __init__(
        self,
        host: str,
        port: int,
        login: str,
        password: str,
        virtual_host: str,
        queue: str
    ):
        self._host = host
        self._port = port
        self._login = login
        self._password = password
        self._virtual_host = virtual_host
        self._queue_name=queue
        
        self._connection: RobustConnection | None = None
        self._channel: AbstractRobustChannel | None = None


    async def connect(self) -> None: 
        self._connection = await aio_pika.connect_robust(
            host=self._host,
            port=self._port,
            login=self._login,
            password=self._password,
            virtualhost=self._virtual_host
        )
        
        channel = self._connection.channel(
            publisher_confirms=True
        )
        
        await channel.initialize()
        
        self._channel = channel
        
        await self._channel.declare_queue(
            self._queue_name,
            durable=True,
            auto_delete=False
        )


    async def publish(self, payload: dict[str, Any] | BaseModel) -> None:
        if self._connection is None:
            raise RuntimeError("RabbitMQ publisher is not connected")
        
        if self._channel is None:
            raise RuntimeError("RabbitMQ channel is not initialized")
        
        if isinstance(payload, BaseModel):
            body = payload.model_dump_json().encode("utf-8")
        else:
            body = json.dumps(payload).encode("utf-8")
        
        message = aio_pika.Message(
            body=body,
            content_type="application/json",
            content_encoding="utf-8",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        
        await self._channel.default_exchange.publish(
            message,
            routing_key=self._queue_name,
            mandatory=True
        )


    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
        
