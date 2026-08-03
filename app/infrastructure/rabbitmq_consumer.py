import logging
import asyncio
import aio_pika
from collections.abc import Awaitable, Callable
from aio_pika.abc import AbstractIncomingMessage, AbstractRobustChannel, AbstractRobustConnection
from pydantic import ValidationError

from app.schemas.external_schemes.until_schemes import CreateDeliveryJob

logger = logging.getLogger(__name__)

JobHandler = Callable[[CreateDeliveryJob], Awaitable[None]]

class RabbitMQConsumer:
    def __init__(
        self,
        url: str,
        queue_name: str,
        handler: JobHandler
    ):
        self._url = url
        self._queue_name = queue_name
        self._handler = handler

        self._connection: AbstractRobustConnection | None = None
        self._channel: AbstractRobustChannel | None = None
        
    
    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._url)
        
        channel = self._connection.channel()
        await channel.initialize()
        await channel.set_qos(prefetch_count=1)
        queue = await channel.declare_queue(self._queue_name, durable=True)
        self._channel = channel
        
        await queue.consume(self._process_message)
        
        logger.info(
            "RabbitMQ consumer слушает очередь: %s",
            self._queue_name
        )
        
    
    async def _process_message(
        self,
        message: AbstractIncomingMessage
    ) -> None:
        
        try:
            job = CreateDeliveryJob.model_validate_json(message.body)

        except ValidationError:
            logger.exception(
                "ПОлучено некорректное сообщение: %r",
                message.body
            )
            
            await message.reject(requeue=False)
            return
        
        logger.info(
            "Получена задача: task_id=%s marketplace_job_id=%s",
            job.task_id,
            job.marketplace_job_id
        )
        
        try:
            await self._handler(job)
        except Exception:
            logger.exception(
                "Ошибка выполнения задачи: task_id=%s",
                job.task_id
            )
            
            await asyncio.sleep(5)
            await message.nack(requeue=True)
            return

        await message.ack()
        
        logger.info(
            "Залача успешно обработана: task_id=%s",
            job.task_id
        )
    
    
    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()