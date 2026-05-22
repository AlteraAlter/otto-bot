"""File upload endpoints for media assets."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4
from datetime import datetime
import os
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.dependencies import get_current_user
from app.schemas.userDTO import UserDTO

router = APIRouter(prefix="/v1/uploads", tags=["Uploads"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 10 * 1024 * 1024
DEFAULT_UPLOADS_DIR = Path("/app/uploads")


def _sanitize_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: UserDTO = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="File is required"
        )

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image type",
        )

    content = await file.read()
    size = len(content)
    if size <= 0 or size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image size must be between 1B and 10MB",
        )

    uploads_dir = Path(os.getenv("UPLOADS_DIR", str(DEFAULT_UPLOADS_DIR))).resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _sanitize_name(file.filename)
    filename = f"{int(datetime.utcnow().timestamp() * 1000)}-{uuid4()}-{safe_name}"
    target = uploads_dir / filename
    try:
        target.write_bytes(content)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file to uploads directory: {exc}",
        ) from exc

    image_url = f"/uploads/{filename}"
    public_base = os.getenv("FRONTEND_APP_URL", "http://localhost").rstrip("/")

    return {
        "success": True,
        "imageUrl": image_url,
        "downloadUrl": f"{public_base}{image_url}",
        "fileName": file.filename,
        "size": size,
        "uploadedBy": current_user.email,
    }
