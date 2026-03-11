from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_product_service
from app.services.product_service import ProductService

router = APIRouter(prefix="/v1/products", tags=["Products"])

# <======= GET METHOD =======>

@router.get("")
async def get_products(
    product_service: ProductService = Depends(get_product_service),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(100, ge=10, le=100),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
):
    payload = {
        "page": page,
        "sku": sku,
        "limit": limit,
        "productReference": product_reference,
        "category": category.capitalize() if category else None,
        "brandId": brand_id,
    }

    payload = {k: v for k, v in payload.items() if v is not None}

    return await product_service.get_products(payload)

@router.get("/active")
async def get_active_products(
    product_service: ProductService = Depends(get_product_service),
    product_reference: Optional[str] = Query(None, alias="productReference"),
    page: int = Query(0, ge=0),
    sku: Optional[str] = Query(None),
    limit: int = Query(100, ge=10, le=100),
    category: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None, alias="brandId"),
):
    payload = {
        "page": page,
        "sku": sku,
        "limit": limit,
        "productReference": product_reference,
        "category": category.capitalize() if category else None,
        "brandId": brand_id,
    }

    payload = {k: v for k, v in payload.items() if v is not None}

    return await product_service.get_active_products(payload) 


# <======= POST METHOD =======> 
@router.post("/create") 
async def create_or_update_products():
    return