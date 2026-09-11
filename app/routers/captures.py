import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.services.auth import get_current_user_id
from app.services.db import get_client
from app.services.entitlements import enforce_monthly_limit

router = APIRouter(prefix="/captures", tags=["captures"])

MAX_OCR_TEXT_CHARS = 50_000


class OcrBlock(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)
    left: float = Field(..., ge=0.0, le=1.0)
    top: float = Field(..., ge=0.0, le=1.0)
    width: float = Field(..., ge=0.0, le=1.0)
    height: float = Field(..., ge=0.0, le=1.0)


class CaptureCreate(BaseModel):
    client_event_id: str = Field(..., max_length=64)
    capture_mode: str = Field("on_device_ocr")
    extracted_text: str = Field(..., min_length=1, max_length=MAX_OCR_TEXT_CHARS)
    entities: dict = Field(default_factory=dict)
    app_source: str | None = Field(None, max_length=120)
    ocr_blocks: list[OcrBlock] = Field(default_factory=list, max_length=120)
    captured_at: datetime | None = None
    screenshot_id: str | None = None

    @field_validator("client_event_id")
    @classmethod
    def validate_event_id(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value.strip()))
        except (ValueError, AttributeError):
            raise ValueError("client_event_id must be a valid UUID")

    @field_validator("capture_mode")
    @classmethod
    def validate_capture_mode(cls, value: str) -> str:
        allowed = {"on_device_ocr", "uploaded_image", "shared_text"}
        normalized = value.strip().lower()
        if normalized not in allowed:
            raise ValueError("Unsupported capture_mode")
        return normalized

    @field_validator("screenshot_id")
    @classmethod
    def validate_screenshot_id(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            return str(uuid.UUID(value.strip()))
        except (ValueError, AttributeError):
            raise ValueError("screenshot_id must be a valid UUID")


@router.post("")
def create_capture(payload: CaptureCreate, user_id: str = Depends(get_current_user_id)):
    # Quota is checked at enqueue time. Usage is only recorded after successful
    # finalization, so failed jobs do not consume the allowance.
    entitlements = enforce_monthly_limit(
        user_id=user_id,
        entitlement_key="captures_per_month",
        usage_event_type="capture_processed",
    )

    client = get_client()
    try:
        result = client.rpc(
            "enqueue_capture_event",
            {
                "p_user_id": user_id,
                "p_client_event_id": payload.client_event_id,
                "p_capture_mode": payload.capture_mode,
                "p_source": payload.app_source,
                "p_captured_at": payload.captured_at.isoformat() if payload.captured_at else None,
                "p_raw_ocr_text": payload.extracted_text.strip(),
                "p_ocr_blocks": [block.model_dump() for block in payload.ocr_blocks],
                "p_entities": payload.entities,
                "p_screenshot_id": payload.screenshot_id,
            },
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Unable to queue capture right now.") from exc

    capture = result.data
    if isinstance(capture, list):
        capture = capture[0] if capture else None
    if not capture:
        raise HTTPException(status_code=503, detail="Capture enqueue returned no result.")

    return {
        "capture_id": capture["id"],
        "client_event_id": capture["client_event_id"],
        "status": capture["status"],
        "plan": entitlements.get("plan_code", "free"),
        "poll_url": f"/captures/{capture['id']}",
    }


@router.get("/{capture_id}")
def get_capture(capture_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        capture_uuid = str(uuid.UUID(capture_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid capture id")

    client = get_client()
    result = (
        client.table("capture_events")
        .select("id,client_event_id,capture_mode,source,captured_at,status,attempt_count,next_retry_at,last_error,result_version,created_at,updated_at,completed_at")
        .eq("id", capture_uuid)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Capture not found")

    capture = result.data[0]
    memories = []
    if capture["status"] == "completed":
        occ = (
            client.table("memory_occurrences")
            .select("memory_id")
            .eq("capture_id", capture_uuid)
            .execute()
        )
        memory_ids = [row["memory_id"] for row in (occ.data or [])]
        if memory_ids:
            memory_result = client.table("memories").select("*").in_("id", memory_ids).execute()
            memories = memory_result.data or []

    return {**capture, "memories": memories}


@router.post("/{capture_id}/retry")
def retry_capture(capture_id: str, user_id: str = Depends(get_current_user_id)):
    """Manually requeue a retryable capture.

    Active processing jobs are never reset here: doing so could allow two workers
    to process the same capture concurrently. Expired worker leases are recovered
    automatically by the claim RPC.
    """
    try:
        capture_uuid = str(uuid.UUID(capture_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid capture id")

    client = get_client()
    capture_result = (
        client.table("capture_events")
        .select("id,status,next_retry_at")
        .eq("id", capture_uuid)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not capture_result.data:
        raise HTTPException(status_code=404, detail="Capture not found")

    capture = capture_result.data[0]
    status = capture["status"]

    if status == "completed":
        return {"capture_id": capture_uuid, "status": "completed"}
    if status == "processing":
        raise HTTPException(
            status_code=409,
            detail="Capture is currently processing. Its worker lease will recover automatically if the worker stops.",
        )
    if status == "failed_permanent":
        raise HTTPException(status_code=409, detail="This capture cannot be retried.")
    if status == "queued":
        return {"capture_id": capture_uuid, "status": "queued"}

    # Only failed_retryable reaches this point.
    now_iso = datetime.now(timezone.utc).isoformat()
    client.table("capture_events").update({
        "status": "queued",
        "next_retry_at": None,
        "last_error": None,
        "updated_at": now_iso,
    }).eq("id", capture_uuid).eq("user_id", user_id).execute()

    client.table("capture_jobs").update({
        "status": "queued",
        "run_after": now_iso,
        "locked_at": None,
        "locked_by": None,
        "lease_expires_at": None,
        "last_error": None,
        "updated_at": now_iso,
    }).eq("capture_id", capture_uuid).execute()

    return {"capture_id": capture_uuid, "status": "queued"}
