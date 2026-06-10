"""FastAPI application entrypoint and top-level route registration."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes.afterbuy import router as afterbuy_router
from app.api.routes.auth import router as auth_router
from app.api.routes.products import otto_v5_router, router as products_router
from app.api.routes.uploads import router as uploads_router

app = FastAPI(title="FastAPI Template")
app.include_router(auth_router)
app.include_router(afterbuy_router)
app.include_router(products_router)
app.include_router(otto_v5_router)
app.include_router(uploads_router)

uploads_dir = Path(os.getenv("UPLOADS_DIR", "storage/uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


@app.get("/health")
async def health_check():
    """Simple liveness endpoint used by uptime checks and deployments."""
    return {"status": "ok"}
