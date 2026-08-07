import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.db import get_client, get_bucket_name, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.services.vision import extract_intent_from_screenshot
from app.services.dedupe import upsert_memory

router = APIRouter(prefix="/screenshot", tags=["upload"])


@router.post("")
async def upload_screenshot(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Full pipeline: upload image -> Supabase Storage -> vision extraction -> dedupe -> save memories."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    client = get_client()
    bucket = get_bucket_name()

    file_ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    storage_path = f"{user_id}/{uuid.uuid4()}.{file_ext}"

    try:
        client.storage.from_(bucket).upload(
            storage_path, image_bytes, {"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    image_url = get_signed_screenshot_url(storage_path)

    screenshot_row = client.table("screenshots").insert({
        "user_id": user_id,
        "image_url": storage_path,  # store the path, not a permanent URL - bucket is private now
        "source": "manual",
    }).execute()
    screenshot_id = screenshot_row.data[0]["id"]

    try:
        extraction = extract_intent_from_screenshot(image_bytes, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision extraction failed: {e}")

    saved_memories = []
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
        saved_memories.append(memory)

    return {
        "screenshot_id": screenshot_id,
        "intent": extraction.intent,
        "category": extraction.category,
        "memories": saved_memories,
        "image_url": image_url,  # signed URL, valid for 1 hour
    }
