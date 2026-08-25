import asyncio
from fastapi import APIRouter, Query, Depends, HTTPException, status
from typing import Optional

from app.services.db import get_client, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.models.schema import MemoryUpdate

router = APIRouter(prefix="/memories", tags=["memories"])


@router.get("")
async def list_memories(
    intent: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    is_done: Optional[bool] = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    client = get_client()

    def _fetch():
        query = client.table("memories").select("*").eq("user_id", user_id)
        if intent:
            query = query.eq("intent", intent.upper())
        if is_done is not None:
            query = query.eq("is_done", is_done)
        if search and search.strip():
            term = search.strip()
            # PostgREST ilike search across item_name, summary, and extracted_text
            query = query.or_(f"item_name.ilike.%{term}%,summary.ilike.%{term}%,extracted_text.ilike.%{term}%")

        result = query.order("last_seen", desc=True).execute()
        memories = result.data or []

        # Batch resolve signed screenshot URLs for fast image previews
        screenshot_ids = list({m["screenshot_id"] for m in memories if m.get("screenshot_id")})
        path_map = {}
        if screenshot_ids:
            screenshots_res = client.table("screenshots").select("id, image_url").in_("id", screenshot_ids).execute()
            path_map = {row["id"]: row["image_url"] for row in (screenshots_res.data or [])}

        for m in memories:
            storage_path = path_map.get(m.get("screenshot_id"))
            if storage_path:
                try:
                    m["image_url"] = get_signed_screenshot_url(storage_path)
                except Exception:
                    m["image_url"] = None
            else:
                m["image_url"] = None

        return memories

    memories_data = await asyncio.to_thread(_fetch)
    return {"count": len(memories_data), "memories": memories_data}


@router.get("/summary")
async def memories_summary(user_id: str = Depends(get_current_user_id)):
    client = get_client()

    def _fetch_summary():
        result = client.table("memories").select("intent, is_done").eq("user_id", user_id).execute()
        counts: dict[str, int] = {}
        active_count = 0
        done_count = 0
        for row in (result.data or []):
            intent = row.get("intent")
            counts[intent] = counts.get(intent, 0) + 1
            if row.get("is_done"):
                done_count += 1
            else:
                active_count += 1
        return {"by_intent": counts, "active_count": active_count, "done_count": done_count, "summary": counts}

    summary_data = await asyncio.to_thread(_fetch_summary)
    return summary_data


@router.patch("/{memory_id}")
async def update_memory(
    memory_id: str,
    update_data: MemoryUpdate,
    user_id: str = Depends(get_current_user_id),
):
    client = get_client()

    def _update():
        existing = client.table("memories").select("id").eq("id", memory_id).eq("user_id", user_id).execute()
        if not existing.data:
            return None

        payload = {k: v for k, v in update_data.model_dump().items() if v is not None}
        if not payload:
            return existing.data[0]

        res = client.table("memories").update(payload).eq("id", memory_id).eq("user_id", user_id).execute()
        return res.data[0] if res.data else None

    updated = await asyncio.to_thread(_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "success", "memory": updated}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, user_id: str = Depends(get_current_user_id)):
    client = get_client()

    def _delete():
        # Check ownership
        existing = client.table("memories").select("id").eq("id", memory_id).eq("user_id", user_id).execute()
        if not existing.data:
            return False
        client.table("memories").delete().eq("id", memory_id).eq("user_id", user_id).execute()
        return True

    deleted = await asyncio.to_thread(_delete)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "success", "deleted_id": memory_id}


