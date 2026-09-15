import os
from datetime import datetime, timezone
from app.services.db import get_client

SIMILARITY_THRESHOLD = 0.4  # pg_trgm candidate gate
SEMANTIC_DUPLICATE_THRESHOLD = float(os.environ.get("SEMANTIC_DUPLICATE_THRESHOLD", "0.90"))


def find_similar_memory(user_id: str, item_name: str, intent: str) -> dict | None:
    """Fast stage-1 duplicate detection using pg_trgm within the same intent."""
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


def _embed_and_find_semantic(user_id: str, intent: str, memory: dict) -> tuple[dict | None, list[float] | None]:
    """Stage-2 duplicate detection for differently-worded versions of the same memory."""
    try:
        from app.services.retrieval import embed_memory
        vector = embed_memory(memory)
        result = get_client().rpc(
            "match_memory_semantic",
            {
                "p_user_id": user_id,
                "p_intent": intent,
                "p_embedding": vector,
                "p_threshold": SEMANTIC_DUPLICATE_THRESHOLD,
            },
        ).execute()
        rows = result.data or []
        return (rows[0] if rows else None), vector
    except Exception as exc:
        # pgvector migration/API availability must never block saving a memory.
        print(f"[dedupe] semantic duplicate stage skipped: {exc}")
        return None, None


def _index_existing(memory: dict) -> None:
    """Best-effort vector refresh for a duplicate found by the cheap trigram stage."""
    try:
        from app.services.retrieval import attach_embedding
        attach_embedding(memory)
    except Exception as exc:
        print(f"[dedupe] semantic indexing skipped: {exc}")


def upsert_memory(user_id: str, screenshot_id: str, intent: str, category: str | None,
                   item_name: str, item_type: str | None, summary: str | None,
                   extracted_text: str | None = None) -> dict:
    """Two-stage dedupe: trigram first, semantic similarity second, then insert."""
    client = get_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
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
    }

    # Stage 1 is cheap and catches spelling/format variants without an embedding call.
    existing = find_similar_memory(user_id, item_name, intent)
    if existing:
        updated = client.table("memories").update({
            "frequency": existing["frequency"] + 1,
            "last_seen": now_iso,
            "screenshot_id": screenshot_id,
            "extracted_text": extracted_text or existing.get("extracted_text"),
            "category": category or existing.get("category"),
            "summary": summary or existing.get("summary"),
        }).eq("id", existing["id"]).execute()
        memory = updated.data[0]
        _index_existing(memory)
        return memory

    # Stage 2 catches semantically equivalent names that pg_trgm misses. The same
    # vector is reused for storage, avoiding a second embedding API call.
    semantic_existing, vector = _embed_and_find_semantic(user_id, intent, payload)
    if semantic_existing:
        update_payload = {
            "frequency": semantic_existing["frequency"] + 1,
            "last_seen": now_iso,
            "screenshot_id": screenshot_id,
            "extracted_text": extracted_text or semantic_existing.get("extracted_text"),
            "category": category or semantic_existing.get("category"),
            "summary": summary or semantic_existing.get("summary"),
        }
        if vector is not None:
            update_payload["embedding"] = vector
        updated = client.table("memories").update(update_payload).eq("id", semantic_existing["id"]).execute()
        return updated.data[0]

    if vector is not None:
        payload["embedding"] = vector
    inserted = client.table("memories").insert(payload).execute()
    return inserted.data[0]
