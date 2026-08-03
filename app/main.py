"""FastAPI application entrypoint and top-level route registration."""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.configs import settings
from app.api.routes.afterbuy import router as afterbuy_router
from app.api.routes.auth import router as auth_router
from app.api.routes.products import otto_v5_router, router as products_router
from app.api.routes.uploads import router as uploads_router
from app.api.routes.external_api import router as external_api_router
from app.core.configs import settings
from app.core.logger import logging
from app.core.sentry import init_sentry
from app.infrastructure.rabbitmq import RabbitMQPublisher

logger = logging.getLogger(__name__)

init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    publisher = RabbitMQPublisher(
        host=settings.rabbitmq_host,
        port=settings.rabbitmq_port,
        login=settings.rabbitmq_app_user,
        password=settings.rabbitmq_app_password,
        virtual_host=settings.rabbitmq_virtual_host,
        queue="otto.jobs"
    )
    
    await publisher.connect()
    app.state.rabbitmq_publisher = publisher

    try:
        yield
    finally:
        await publisher.close()

app = FastAPI(title="FastAPI Template", lifespan=lifespan)

app.include_router(external_api_router)
app.include_router(auth_router)
app.include_router(afterbuy_router)
app.include_router(products_router)
app.include_router(otto_v5_router)
app.include_router(uploads_router)

uploads_dir = Path(os.getenv("UPLOADS_DIR", "storage/uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

generated_media_dir = Path(settings.generated_media_root)
generated_media_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    settings.generated_media_url_prefix,
    StaticFiles(directory=generated_media_dir),
    name="generated-media",
)


@app.get("/health")
async def health_check():
    """Simple liveness endpoint used by uptime checks and deployments."""
    return {"status": "ok"}

