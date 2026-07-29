"""FastAPI application entrypoint and top-level route registration."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes.afterbuy import router as afterbuy_router
from app.api.routes.auth import router as auth_router
from app.api.routes.products import otto_v5_router, router as products_router
from app.api.routes.uploads import router as uploads_router
from app.api.routes.external_api import router as external_api_router
from app.core.configs import settings
from app.core.logger import logging
from app.core.sentry import init_sentry

logger = logging.getLogger(__name__)

init_sentry()

app = FastAPI(title="FastAPI Template")
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


@app.on_event("startup")
async def log_startup() -> None:
    logger.info(
        "Приложение запущено: uploads_dir=%s generated_media_dir=%s",
        uploads_dir,
        generated_media_dir,
    )
