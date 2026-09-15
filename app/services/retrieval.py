"""Semantic + lexical retrieval for Samhaal memories.

This module keeps the LLM out of candidate selection. Gemini embeddings are used to
represent memories/queries; PostgreSQL/pgvector performs vector search and combines
it with lexical, recency and frequency signals in `hybrid_search_memories`.
"""

import math
import os
from datetime import datetime, timezone
from typing import Any

from google import genai
from google.genai import types

from app.services.db import get_client

EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "768"))
EMBEDDING_MODEL = os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
DEFAULT_TOP_K = int(os.environ.get("RETRIEVAL_TOP_K", "8"))
CANDIDATE_MULTIPLIER = int(os.environ.get("RETRIEVAL_CANDIDATE_MULTIPLIER", "4"))

_embedding_client: genai.Client | None = None


def _client() -> genai.Client:
    global _embedding_client
    if _embedding_client is None:
        _embedding_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _embedding_client


def _normalise(values: list[float]) -> list[float]:
    """Normalise truncated gemini-embedding-001 vectors for cosine retrieval."""
    norm = math.sqrt(sum(v * v for v in values))
    if not norm:
        return values
    return [v / norm for v in values]


def _embed(text: str, task_type: str, title: str | None = None) -> list[float]:
    config_kwargs: dict[str, Any] = {
        "task_type": task_type,
        "output_dimensionality": EMBEDDING_DIM,
    }
    if title and task_type == "RETRIEVAL_DOCUMENT":
        config_kwargs["title"] = title[:200]

    result = _client().models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text[:12000],
        config=types.EmbedContentConfig(**config_kwargs),
    )
    if not result.embeddings:
        raise RuntimeError("Embedding model returned no vectors")
    return _normalise(list(result.embeddings[0].values))


def memory_document(memory: dict) -> str:
    """Create one stable retrieval document from the fields Samhaal already stores."""
    parts = [
        memory.get("item_name"),
        memory.get("item_type"),
        memory.get("category"),
        memory.get("intent"),
        memory.get("summary"),
        memory.get("extracted_text"),
    ]
    return "\n".join(str(p).strip() for p in parts if p and str(p).strip())


def embed_memory(memory: dict) -> list[float]:
    document = memory_document(memory)
    if not document:
        raise ValueError("Cannot embed an empty memory")
    return _embed(document, "RETRIEVAL_DOCUMENT", memory.get("item_name"))


def embed_query(query: str) -> list[float]:
    query = query.strip()
    if not query:
        raise ValueError("Search query cannot be empty")
    return _embed(query, "RETRIEVAL_QUERY")


def attach_embedding(memory: dict) -> bool:
    """Generate/store a vector for a memory. Failure is non-fatal to ingestion."""
    try:
        vector = embed_memory(memory)
        get_client().table("memories").update({"embedding": vector}).eq("id", memory["id"]).execute()
        memory["embedding"] = vector
        return True
    except Exception as exc:
        # Schema may not have been migrated yet, or embedding API may be unavailable.
        # Memory ingestion must still succeed; retrieval has a safe lexical fallback.
        print(f"[retrieval] embedding skipped for {memory.get('id')}: {exc}")
        return False


def _fallback_score(memory: dict, query: str) -> float:
    """Deterministic lexical fallback used before/if pgvector migration is available."""
    q_tokens = {t for t in query.lower().split() if len(t) > 1}
    haystack = memory_document(memory).lower()
    lexical = sum(1 for token in q_tokens if token in haystack) / max(len(q_tokens), 1)

    frequency = min(math.log1p(int(memory.get("frequency") or 1)) / math.log(11), 1.0)
    recency = 0.0
    raw_date = memory.get("last_seen") or memory.get("created_at")
    if raw_date:
        try:
            dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
            age_days = max((datetime.now(timezone.utc) - dt).total_seconds() / 86400, 0)
            recency = math.exp(-age_days / 90.0)
        except (ValueError, TypeError):
            pass
    return 0.80 * lexical + 0.15 * recency + 0.05 * frequency


def _fallback_retrieve(user_id: str, query: str, top_k: int) -> list[dict]:
    rows = (
        get_client().table("memories")
        .select("*")
        .eq("user_id", user_id)
        .order("last_seen", desc=True)
        .limit(max(top_k * CANDIDATE_MULTIPLIER, 20))
        .execute().data
        or []
    )
    for row in rows:
        row["retrieval_score"] = _fallback_score(row, query)
        row["semantic_score"] = None
        row["lexical_score"] = row["retrieval_score"]
    rows.sort(key=lambda r: r["retrieval_score"], reverse=True)
    return rows[:top_k]


def retrieve_memories(user_id: str, query: str, top_k: int = DEFAULT_TOP_K) -> list[dict]:
    """Return only the best memories for a query instead of loading the user's full corpus."""
    top_k = max(1, min(int(top_k), 20))
    try:
        query_embedding = embed_query(query)
        result = get_client().rpc(
            "hybrid_search_memories",
            {
                "p_user_id": user_id,
                "p_query": query,
                "p_query_embedding": query_embedding,
                "p_match_count": top_k,
                "p_candidate_count": max(top_k * CANDIDATE_MULTIPLIER, 20),
            },
        ).execute()
        rows = result.data or []
        if rows:
            return rows
    except Exception as exc:
        print(f"[retrieval] hybrid search unavailable, using fallback: {exc}")

    return _fallback_retrieve(user_id, query, top_k)
