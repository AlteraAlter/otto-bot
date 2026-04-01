"""FastAPI application entrypoint and top-level route registration."""

from fastapi import FastAPI
from app.api.routes.auth import router as auth_router
from app.api.routes.products import router as products_router
from app.database import Base

app = FastAPI(title="FastAPI Template")
app.include_router(auth_router)
app.include_router(products_router)


@app.get("/health")
async def health_check():
    """Simple liveness endpoint used by uptime checks and deployments."""
    return {"status": "ok"}
