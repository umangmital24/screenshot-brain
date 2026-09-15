import logging
import os
from datetime import datetime, timezone

from app.services.db import get_client
from app.services.embeddings import (
    EMBEDDING_MODEL,
    embed_text,
    memory_embedding_text,
    vector_literal,
)

logger = logging.getLogger(__name__)
SIMILARITY_THRESHOLD = float(os.environ.get("TRIGRAM_DUPLICATE_THRESHOLD", "0.4"))
SEMANTIC_DUPLICATE_THRESHOLD = float(os.environ.get("SEMANTIC_DUPLICATE_THRESHOLD", "0.90"))


def find_similar_memory(user_id: str, item_name: str, intent: str) -> dict | None:
    """Stage 1: cheap pg_trgm duplicate matching within the same intent."""
    result = get_client().rpc(
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


def _embed(memory: dict) -> list[float] | None:
    try:
        return embed_text(memory_embedding_text(memory))
    except Exception:
        logger.warning("Memory embedding failed; continuing without semantic dedupe", exc_info=True)
        return None


def _find_semantic_memory(user_id: str, intent: str, vector: list[float]) -> dict | None:
    """Stage 2: catch semantically equivalent memories with different wording."""
    try:
        result = get_client().rpc(
            "match_memory_semantic",
            {
                "p_user_id": user_id,
                "p_intent": intent,
                "p_embedding": vector_literal(vector),
                "p_threshold": SEMANTIC_DUPLICATE_THRESHOLD,
            },
        ).execute()
        rows = result.data or []
        return rows[0] if rows else None
    except Exception:
        logger.warning("Semantic duplicate RPC unavailable; continuing with trigram dedupe", exc_info=True)
        return None


def _update_existing(client, existing: dict, screenshot_id: str, category: str | None,
                     summary: str | None, extracted_text: str | None, now_iso: str,
                     vector: list[float] | None = None) -> dict:
    payload = {
        "frequency": int(existing.get("frequency") or 1) + 1,
        "last_seen": now_iso,
        "screenshot_id": screenshot_id,
        "extracted_text": extracted_text or existing.get("extracted_text"),
        "category": category or existing.get("category"),
        "summary": summary or existing.get("summary"),
    }
    if vector:
        payload["embedding"] = vector_literal(vector)
        payload["embedding_model"] = EMBEDDING_MODEL
    updated = client.table("memories").update(payload).eq("id", existing["id"]).execute()
    return updated.data[0]


def upsert_memory(user_id: str, screenshot_id: str, intent: str, category: str | None,
                   item_name: str, item_type: str | None, summary: str | None,
                   extracted_text: str | None = None) -> dict:
    """Two-stage DS dedupe: trigram gate -> embedding similarity -> insert."""
    client = get_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    candidate = {
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

    # Fast path first: no embedding computation for obvious textual duplicates.
    existing = find_similar_memory(user_id, item_name, intent)
    if existing:
        merged_for_embedding = {**existing, **candidate}
        vector = _embed(merged_for_embedding)
        return _update_existing(
            client, existing, screenshot_id, category, summary, extracted_text, now_iso, vector
        )

    # Compute once, use the same vector for semantic duplicate matching and storage.
    vector = _embed(candidate)
    if vector:
        semantic_existing = _find_semantic_memory(user_id, intent, vector)
        if semantic_existing:
            return _update_existing(
                client, semantic_existing, screenshot_id, category, summary,
                extracted_text, now_iso, vector
            )
        candidate["embedding"] = vector_literal(vector)
        candidate["embedding_model"] = EMBEDDING_MODEL

    inserted = client.table("memories").insert(candidate).execute()
    return inserted.data[0]
