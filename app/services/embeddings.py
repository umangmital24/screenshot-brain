from __future__ import annotations

import logging
import os
import threading
from functools import lru_cache
from typing import Iterable

from fastembed import TextEmbedding

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIMENSION = int(os.environ.get("EMBEDDING_DIMENSION", "384"))
_model_lock = threading.Lock()


@lru_cache(maxsize=1)
def _get_model() -> TextEmbedding:
    logger.info("Loading local embedding model %s", EMBEDDING_MODEL)
    return TextEmbedding(model_name=EMBEDDING_MODEL)


def _normalize_text(text: str) -> str:
    return " ".join((text or "").split()).strip()


def embed_text(text: str) -> list[float] | None:
    normalized = _normalize_text(text)
    if not normalized:
        return None
    with _model_lock:
        vector = next(iter(_get_model().embed([normalized])))
    values = [float(value) for value in vector.tolist()]
    if len(values) != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Embedding dimension mismatch for {EMBEDDING_MODEL}: "
            f"expected {EMBEDDING_DIMENSION}, got {len(values)}"
        )
    return values


def embed_texts(texts: Iterable[str]) -> list[list[float] | None]:
    normalized = [_normalize_text(text) for text in texts]
    nonempty_indexes = [index for index, text in enumerate(normalized) if text]
    output: list[list[float] | None] = [None] * len(normalized)
    if not nonempty_indexes:
        return output

    batch = [normalized[index] for index in nonempty_indexes]
    with _model_lock:
        vectors = list(_get_model().embed(batch))

    for index, vector in zip(nonempty_indexes, vectors):
        values = [float(value) for value in vector.tolist()]
        if len(values) != EMBEDDING_DIMENSION:
            raise ValueError(
                f"Embedding dimension mismatch for {EMBEDDING_MODEL}: "
                f"expected {EMBEDDING_DIMENSION}, got {len(values)}"
            )
        output[index] = values
    return output


def memory_embedding_text(memory: dict) -> str:
    parts = [
        memory.get("item_name"),
        memory.get("category"),
        memory.get("intent"),
        memory.get("summary"),
        memory.get("extracted_text"),
        memory.get("visual_context"),
    ]
    return "\n".join(str(part).strip() for part in parts if part and str(part).strip())[:12000]


def vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


def persist_memory_embeddings(client, memories: list[dict]) -> int:
    if not memories:
        return 0
    vectors = embed_texts(memory_embedding_text(memory) for memory in memories)
    updated = 0
    for memory, vector in zip(memories, vectors):
        memory_id = memory.get("id")
        if not memory_id or not vector:
            continue
        client.table("memories").update({
            "embedding": vector_literal(vector),
            "embedding_model": EMBEDDING_MODEL,
        }).eq("id", memory_id).execute()
        updated += 1
    return updated


def embed_memory_ids(client, memory_ids: list[str], user_id: str | None = None) -> int:
    ids = [memory_id for memory_id in memory_ids if memory_id]
    if not ids:
        return 0
    query = client.table("memories").select(
        "id,item_name,category,intent,summary,extracted_text,visual_context"
    ).in_("id", ids)
    if user_id:
        query = query.eq("user_id", user_id)
    result = query.execute()
    return persist_memory_embeddings(client, result.data or [])
