"""Upload endpoints for media assets."""

from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status

router = APIRouter(prefix="/v1/uploads", tags=["Uploads"])

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    suffix = ALLOWED_IMAGE_CONTENT_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image type",
        )

    uploads_dir = Path(os.getenv("UPLOADS_DIR", "storage/uploads"))
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{suffix}"
    destination = uploads_dir / filename

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty upload",
        )

    destination.write_bytes(data)
    return {
        "success": True,
        "filename": filename,
        "url": f"/uploads/{filename}",
    }
