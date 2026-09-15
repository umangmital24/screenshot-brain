from datetime import datetime, timezone
from app.services.db import get_client

SIMILARITY_THRESHOLD = 0.4  # pg_trgm similarity, 0-1 (tune after testing real data)


def find_similar_memory(user_id: str, item_name: str, intent: str) -> dict | None:
    """Uses Postgres pg_trgm similarity via an RPC function to find a near-duplicate
    memory for this user within the same intent. Returns the existing row dict if found, else None.
    """
    client = get_client()
    result = client.rpc(
        "match_memory",
        {
            "p_user_id": user_id,
            "p_item_name": item_name,
            "p_intent": intent,
            "p_threshold": SIMILARITY_THRESHOLD,
        },
    ).execute()
    rows = result.data or []
    return rows[0] if rows else None


def upsert_memory(user_id: str, screenshot_id: str, intent: str, category: str | None,
                   item_name: str, item_type: str | None, summary: str | None,
                   extracted_text: str | None = None) -> dict:
    """Insert a new memory, or bump frequency + last_seen if a similar one exists."""
    client = get_client()
    existing = find_similar_memory(user_id, item_name, intent)
    now_iso = datetime.now(timezone.utc).isoformat()

    if existing:
        updated = client.table("memories").update({
            "frequency": existing["frequency"] + 1,
            "last_seen": now_iso,
            # keep screenshot_id/extracted_text pointed at the most recent sighting,
            # so "click to view" always opens the latest matching screenshot
            "screenshot_id": screenshot_id,
            "extracted_text": extracted_text or existing.get("extracted_text"),
        }).eq("id", existing["id"]).execute()
        return updated.data[0]

    inserted = client.table("memories").insert({
        "screenshot_id": screenshot_id,
        "user_id": user_id,
        "intent": intent,
        "category": category,
        "item_name": item_name,
        "item_type": item_type,
        "summary": summary,
        "extracted_text": extracted_text,
        "frequency": 1,
        "last_seen": now_iso,
    }).execute()
    return inserted.data[0]
