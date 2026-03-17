from fastapi import APIRouter, File, UploadFile
import json

router = APIRouter(prefix="/v1/uploader", tags=["Uploader"])


@router.post("/send-file")
async def process_data_from_uploader(file: UploadFile = File(...)):
    content = await file.read()
    data = json.loads(content)
    print(data)
    return data
