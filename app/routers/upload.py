import uuid
import asyncio
import logging
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.db import get_client, get_bucket_name, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.services.vision import extract_intent_from_screenshot, extract_intent_from_metadata
from app.services.dedupe import upsert_memory
from app.services.image_utils import validate_and_normalize_image, InvalidImageError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/screenshot", tags=["upload"])

MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024
MAX_OCR_TEXT_CHARS = 50_000


class OcrBlock(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)
    left: float = Field(..., ge=0.0, le=1.0)
    top: float = Field(..., ge=0.0, le=1.0)
    width: float = Field(..., ge=0.0, le=1.0)
    height: float = Field(..., ge=0.0, le=1.0)


class ClientMetadataPayload(BaseModel):
    extracted_text: str = Field(..., min_length=1, max_length=MAX_OCR_TEXT_CHARS, description="On-device OCR extracted text")
    entities: dict | None = Field(default_factory=dict, description="Extracted URLs, phones, prices")
    app_source: str | None = Field(None, max_length=120, description="Foreground source app/package if detected")
    ocr_blocks: list[OcrBlock] = Field(default_factory=list, max_length=120, description="On-device OCR blocks with normalized screen geometry")
    image_storage_path: str | None = Field(None, max_length=500, description="Optional private storage path")
    client_event_id: str | None = Field(None, max_length=64, description="Client-generated idempotency key for retry-safe captures")
    captured_at: datetime | None = Field(None, description="Client capture timestamp")

    @field_validator("client_event_id")
    @classmethod
    def validate_client_event_id(cls, value):
        if value is None:
            return value
        cleaned = value.strip()
        try:
            return str(uuid.UUID(cleaned))
        except (ValueError, AttributeError):
            raise ValueError("client_event_id must be a valid UUID")


def _mark_screenshot(client, screenshot_id: str, status: str, error_message: str | None = None) -> None:
    payload = {"processing_status": status, "processing_error": error_message}
    client.table("screenshots").update(payload).eq("id", screenshot_id).execute()


def _fetch_memories_for_screenshot(client, user_id: str, screenshot_id: str) -> list[dict]:
    result = (
        client.table("memories")
        .select("*")
        .eq("user_id", user_id)
        .eq("screenshot_id", screenshot_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


@router.post("/metadata")
async def process_on_device_metadata(
    payload: ClientMetadataPayload,
    user_id: str = Depends(get_current_user_id),
):
    text = payload.extracted_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="extracted_text cannot be empty.")

    if payload.image_storage_path and not payload.image_storage_path.startswith(f"{user_id}/"):
        raise HTTPException(status_code=400, detail="Invalid image storage path.")

    client = get_client()
    storage_path = payload.image_storage_path
    screenshot_id: str | None = None
    retry_existing_failed = False

    def _find_existing_event():
        if not payload.client_event_id:
            return None
        result = (
            client.table("screenshots")
            .select("id,processing_status,processing_error")
            .eq("user_id", user_id)
            .eq("client_event_id", payload.client_event_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    try:
        existing = await asyncio.to_thread(_find_existing_event)
    except Exception:
        logger.exception("Failed to check screenshot idempotency key")
        raise HTTPException(status_code=503, detail="Unable to start screenshot processing.")

    if existing:
        screenshot_id = existing["id"]
        status = existing.get("processing_status") or "processing"

        if status == "ready":
            try:
                existing_memories = await asyncio.to_thread(_fetch_memories_for_screenshot, client, user_id, screenshot_id)
            except Exception:
                logger.exception("Failed to fetch memories for idempotent screenshot retry")
                raise HTTPException(status_code=503, detail="Unable to load the saved screenshot result.")

            first_memory = existing_memories[0] if existing_memories else {}
            return {
                "screenshot_id": screenshot_id,
                "intent": first_memory.get("intent"),
                "category": first_memory.get("category"),
                "memories": existing_memories,
                "mode": "on_device_privacy",
                "processing_status": "ready",
                "idempotent_replay": True,
            }

        if status == "processing":
            return {
                "screenshot_id": screenshot_id,
                "intent": None,
                "category": None,
                "memories": [],
                "mode": "on_device_privacy",
                "processing_status": "processing",
                "idempotent_replay": True,
            }

        retry_existing_failed = True

    if screenshot_id is None:
        def _insert_screenshot_record():
            insert_payload = {
                "user_id": user_id,
                "image_url": storage_path,
                "source": payload.app_source or "on_device_ocr",
                "processing_status": "processing",
            }
            if payload.client_event_id:
                insert_payload["client_event_id"] = payload.client_event_id
            if payload.captured_at:
                insert_payload["captured_at"] = payload.captured_at.isoformat()

            row = client.table("screenshots").insert(insert_payload).execute()
            if not row.data:
                raise RuntimeError("Screenshot insert returned no data")
            return row.data[0]["id"]

        try:
            screenshot_id = await asyncio.to_thread(_insert_screenshot_record)
        except Exception:
            if payload.client_event_id:
                try:
                    raced = await asyncio.to_thread(_find_existing_event)
                except Exception:
                    raced = None
                if raced:
                    status = raced.get("processing_status") or "processing"
                    if status == "ready":
                        existing_memories = await asyncio.to_thread(_fetch_memories_for_screenshot, client, user_id, raced["id"])
                        first_memory = existing_memories[0] if existing_memories else {}
                        return {
                            "screenshot_id": raced["id"],
                            "intent": first_memory.get("intent"),
                            "category": first_memory.get("category"),
                            "memories": existing_memories,
                            "mode": "on_device_privacy",
                            "processing_status": "ready",
                            "idempotent_replay": True,
                        }
                    return {
                        "screenshot_id": raced["id"],
                        "intent": None,
                        "category": None,
                        "memories": [],
                        "mode": "on_device_privacy",
                        "processing_status": status,
                        "idempotent_replay": True,
                    }

            logger.exception("Failed to create screenshot metadata record")
            raise HTTPException(status_code=503, detail="Unable to start screenshot processing.")
    elif retry_existing_failed:
        try:
            await asyncio.to_thread(_mark_screenshot, client, screenshot_id, "processing", None)
        except Exception:
            logger.exception("Failed to restart failed screenshot processing")
            raise HTTPException(status_code=503, detail="Unable to retry screenshot processing.")

    try:
        extraction = await asyncio.to_thread(
            extract_intent_from_metadata,
            text,
            payload.entities,
            payload.app_source,
            [block.model_dump() for block in payload.ocr_blocks],
        )

        def _save_all_memories():
            saved = []
            items = extraction.items or []
            if not items:
                raise RuntimeError("No extracted items returned")
            for item in items:
                saved.append(upsert_memory(
                    user_id=user_id,
                    screenshot_id=screenshot_id,
                    intent=extraction.intent,
                    category=extraction.category,
                    item_name=item.name,
                    item_type=item.type,
                    summary=extraction.summary,
                    extracted_text=extraction.extracted_text or text,
                ))
            _mark_screenshot(client, screenshot_id, "ready")
            return saved

        saved_memories = await asyncio.to_thread(_save_all_memories)
    except Exception:
        logger.exception("On-device metadata processing failed")
        try:
            await asyncio.to_thread(_mark_screenshot, client, screenshot_id, "failed", "Processing failed")
        except Exception:
            logger.exception("Failed to mark screenshot as failed")
        raise HTTPException(status_code=502, detail="We couldn't process this screenshot right now. Please try again.")

    return {
        "screenshot_id": screenshot_id,
        "intent": extraction.intent,
        "category": extraction.category,
        "memories": saved_memories,
        "mode": "on_device_privacy",
        "processing_status": "ready",
        "idempotent_replay": retry_existing_failed,
    }


@router.post("")
async def upload_screenshot(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    raw_bytes = await file.read(MAX_IMAGE_SIZE_BYTES + 1)
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File size exceeds maximum limit of 15MB.")

    try:
        image_bytes, safe_content_type, file_ext = await asyncio.to_thread(validate_and_normalize_image, raw_bytes)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    client = get_client()
    bucket = get_bucket_name()
    storage_path = f"{user_id}/{uuid.uuid4()}.{file_ext}"

    def _upload_and_insert():
        uploaded = False
        try:
            client.storage.from_(bucket).upload(storage_path, image_bytes, {"content-type": safe_content_type})
            uploaded = True
            row = client.table("screenshots").insert({
                "user_id": user_id,
                "image_url": storage_path,
                "source": "web_manual",
                "processing_status": "processing",
            }).execute()
            if not row.data:
                raise RuntimeError("Screenshot insert returned no data")
            return row.data[0]["id"]
        except Exception:
            if uploaded:
                try:
                    client.storage.from_(bucket).remove([storage_path])
                except Exception:
                    logger.exception("Failed to clean up orphaned storage object")
            raise

    try:
        screenshot_id = await asyncio.to_thread(_upload_and_insert)
    except Exception:
        logger.exception("Screenshot upload failed")
        raise HTTPException(status_code=503, detail="Unable to upload screenshot right now. Please try again.")

    try:
        extraction = await asyncio.to_thread(extract_intent_from_screenshot, image_bytes, safe_content_type)

        def _save_all_memories():
            if not extraction.items:
                raise RuntimeError("No extracted items returned")
            saved = []
            for item in extraction.items:
                saved.append(upsert_memory(
                    user_id=user_id,
                    screenshot_id=screenshot_id,
                    intent=extraction.intent,
                    category=extraction.category,
                    item_name=item.name,
                    item_type=item.type,
                    summary=extraction.summary,
                    extracted_text=extraction.extracted_text,
                ))
            _mark_screenshot(client, screenshot_id, "ready")
            return saved

        saved_memories = await asyncio.to_thread(_save_all_memories)
    except Exception:
        logger.exception("Vision screenshot processing failed")
        try:
            await asyncio.to_thread(_mark_screenshot, client, screenshot_id, "failed", "Processing failed")
        except Exception:
            logger.exception("Failed to mark screenshot as failed")
        raise HTTPException(status_code=502, detail="We couldn't understand this screenshot right now. Please try again.")

    try:
        image_url = await asyncio.to_thread(get_signed_screenshot_url, storage_path)
    except Exception:
        logger.exception("Could not create signed screenshot URL")
        image_url = None

    return {
        "screenshot_id": screenshot_id,
        "intent": extraction.intent,
        "category": extraction.category,
        "memories": saved_memories,
        "image_url": image_url,
        "processing_status": "ready",
    }
