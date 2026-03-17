from fastapi import FastAPI
from app.api.routes.products import router as products_router
from app.api.routes.uploader import router as upload_router

app = FastAPI(title="FastAPI Template")
app.include_router(products_router)
app.include_router(upload_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
