import uuid
import asyncio
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.db import get_client, get_bucket_name, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.services.vision import extract_intent_from_screenshot, extract_intent_from_metadata
from app.services.dedupe import upsert_memory

router = APIRouter(prefix="/screenshot", tags=["upload"])

MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB limit


class ClientMetadataPayload(BaseModel):
    extracted_text: str = Field(..., description="On-device OCR extracted text")
    entities: dict | None = Field(default_factory=dict, description="Extracted URLs, phones, prices")
    app_source: str | None = Field(None, description="Source app name if detected")
    image_storage_path: str | None = Field(None, description="Optional private storage path")


@router.post("/metadata")
async def process_on_device_metadata(
    payload: ClientMetadataPayload,
    user_id: str = Depends(get_current_user_id),
):
    """
    Privacy-First On-Device Endpoint:
    Receives on-device extracted OCR text and metadata.
    Zero raw image pixels are transmitted to Gemini.
    """
    if not payload.extracted_text or not payload.extracted_text.strip():
        raise HTTPException(status_code=400, detail="extracted_text cannot be empty.")

    client = get_client()

    # 1. Create screenshot metadata record (without requiring cloud image upload)
    storage_path = payload.image_storage_path or f"{user_id}/local-{uuid.uuid4()}"
    
    def _insert_screenshot_record():
        row = client.table("screenshots").insert({
            "user_id": user_id,
            "image_url": storage_path,
            "source": payload.app_source or "on_device_ocr",
        }).execute()
        return row.data[0]["id"]

    try:
        screenshot_id = await asyncio.to_thread(_insert_screenshot_record)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database record creation failed: {e}")

    # 2. Text-only Intent Classification via Gemini (Zero image bytes sent to LLM)
    try:
        extraction = await asyncio.to_thread(
            extract_intent_from_metadata,
            payload.extracted_text,
            payload.entities,
            payload.app_source,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Intent extraction failed: {e}")

    # 3. Save memory records
    def _save_all_memories():
        saved = []
        items = extraction.items if extraction.items else [{"name": extraction.summary or "Untitled", "type": None}]
        for item in items:
            item_name = item.name if hasattr(item, "name") else item["name"]
            item_type = item.type if hasattr(item, "type") else item.get("type")
            memory = upsert_memory(
                user_id=user_id,
                screenshot_id=screenshot_id,
                intent=extraction.intent,
                category=extraction.category,
                item_name=item_name,
                item_type=item_type,
                summary=extraction.summary,
                extracted_text=extraction.extracted_text or payload.extracted_text,
            )
            saved.append(memory)
        return saved

    saved_memories = await asyncio.to_thread(_save_all_memories)

    return {
        "screenshot_id": screenshot_id,
        "intent": extraction.intent,
        "category": extraction.category,
        "memories": saved_memories,
        "mode": "on_device_privacy",
    }


@router.post("")
async def upload_screenshot(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Full pipeline: upload image -> Supabase Storage -> vision extraction -> dedupe -> save memories."""
    content_type = file.content_type or ""
    if not content_type.startswith("image/") and not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif")):
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid image (PNG, JPG, WebP, HEIC).")

    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File size exceeds maximum limit of 15MB.")

    client = get_client()
    bucket = get_bucket_name()

    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    storage_path = f"{user_id}/{uuid.uuid4()}.{file_ext}"
    safe_content_type = content_type if content_type.startswith("image/") else f"image/{file_ext}"

    def _upload_and_insert():
        client.storage.from_(bucket).upload(
            storage_path, image_bytes, {"content-type": safe_content_type}
        )
        url = get_signed_screenshot_url(storage_path)
        row = client.table("screenshots").insert({
            "user_id": user_id,
            "image_url": storage_path,  # store the path, not a permanent URL - bucket is private now
            "source": "manual",
        }).execute()
        return row.data[0]["id"], url

    try:
        screenshot_id, image_url = await asyncio.to_thread(_upload_and_insert)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")


    try:
        extraction = await asyncio.to_thread(extract_intent_from_screenshot, image_bytes, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision extraction failed: {e}")

    def _save_all_memories():
        saved = []
        items = extraction.items if extraction.items else [{"name": extraction.summary or "Untitled", "type": None}]
        for item in items:
            item_name = item.name if hasattr(item, "name") else item["name"]
            item_type = item.type if hasattr(item, "type") else item.get("type")
            memory = upsert_memory(
                user_id=user_id,
                screenshot_id=screenshot_id,
                intent=extraction.intent,
                category=extraction.category,
                item_name=item_name,
                item_type=item_type,
                summary=extraction.summary,
                extracted_text=extraction.extracted_text,
            )
            saved.append(memory)
        return saved

    saved_memories = await asyncio.to_thread(_save_all_memories)

    return {
        "screenshot_id": screenshot_id,
        "intent": extraction.intent,
        "category": extraction.category,
        "memories": saved_memories,
        "image_url": image_url,  # signed URL, valid for 1 hour
    }


