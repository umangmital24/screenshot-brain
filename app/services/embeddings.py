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
