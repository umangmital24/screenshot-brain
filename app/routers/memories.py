from fastapi import APIRouter, Query, Depends
from typing import Optional

from app.services.db import get_client
from app.services.auth import get_current_user_id

router = APIRouter(prefix="/memories", tags=["memories"])


@router.get("")
async def list_memories(
    intent: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    client = get_client()
    query = client.table("memories").select("*").eq("user_id", user_id)
    if intent:
        query = query.eq("intent", intent.upper())

    result = query.order("last_seen", desc=True).execute()
    return {"count": len(result.data), "memories": result.data}


@router.get("/summary")
async def memories_summary(user_id: str = Depends(get_current_user_id)):
    client = get_client()
    result = client.table("memories").select("intent").eq("user_id", user_id).execute()
    counts: dict[str, int] = {}
    for row in result.data:
        counts[row["intent"]] = counts.get(row["intent"], 0) + 1

    return {"summary": counts}
