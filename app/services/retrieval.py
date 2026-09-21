from __future__ import annotations

import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any

from app.services.db import get_client
from app.services.embeddings import embed_text, persist_memory_embeddings, vector_literal
from app.services.query_parser import ParsedAskQuery

logger = logging.getLogger(__name__)
CANDIDATE_LIMIT = 250
VECTOR_CANDIDATE_LIMIT = 80
LAZY_EMBED_LIMIT = 24
DEFAULT_TOP_K = 8

TERM_EQUIVALENTS = {
    "music": ("music", "song", "songs", "track", "tracks", "gaana", "gana", "गाना", "गाने", "गीत"),
    "poetry": ("poetry", "poem", "poems", "shayari", "sher", "kavita", "शायरी", "कविता"),
    "job": ("job", "jobs", "role", "roles", "vacancy", "vacancies", "opening", "openings", "जॉब", "नौकरी"),
}



def _text(value: Any) -> str:
    return str(value or "").strip().lower()


def _visual_text(raw: Any) -> str:
    if not raw:
        return ""
    if isinstance(raw, dict):
        return json.dumps(raw, ensure_ascii=False).lower()
    text = str(raw).strip()
    try:
        return json.dumps(json.loads(text), ensure_ascii=False).lower()
    except Exception:
        return text.lower()


def _word_match_score(term: str, haystack: str) -> float:
    if not term or not haystack:
        return 0.0

    best = 0.0
    for variant in TERM_EQUIVALENTS.get(term, (term,)):
        # Word boundaries work well for Latin text; substring matching also
        # covers Devanagari and inflected/category variants.
        if re.search(rf"\b{re.escape(variant)}\b", haystack):
            return 1.0
        if variant in haystack:
            best = max(best, 0.55)
    return best


def _age_days(value: Any) -> float | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max((datetime.now(timezone.utc) - dt).total_seconds() / 86400.0, 0.0)
    except Exception:
        return None


def _recency_score(value: Any) -> float:
    days = _age_days(value)
    return math.exp(-days / 90.0) if days is not None else 0.0


def _in_time_window(memory: dict, parsed: ParsedAskQuery) -> bool:
    if parsed.since_days is None and parsed.before_days is None:
        return True
    days = _age_days(memory.get("last_seen"))
    if days is None:
        return False
    if parsed.since_days is not None and days > parsed.since_days:
        return False
    if parsed.before_days is not None and days < parsed.before_days:
        return False
    return True


def _searchable(memory: dict) -> tuple[str, str]:
    name = _text(memory.get("item_name"))
    category = _text(memory.get("category"))
    intent = _text(memory.get("intent")).replace("_", " ")
    summary = _text(memory.get("summary"))
    details = _text(memory.get("extracted_text"))
    visual = _visual_text(memory.get("visual_context"))
    # Intent is searchable evidence too: "what should I read?" should match a
    # READ_LATER book even when the title/summary never contains the word "read".
    return f"{name} {category} {intent} {summary} {details}", visual


def _passes_explicit_constraints(memory: dict, parsed: ParsedAskQuery) -> bool:
    searchable, visual = _searchable(memory)
    combined = f"{searchable} {visual}"

    if parsed.intent and _text(memory.get("intent")) != parsed.intent.lower():
        return False

    if parsed.colors:
        for color in parsed.colors:
            if not re.search(rf"\b{re.escape(color)}\b", combined):
                return False

    return True


def score_memory(memory: dict, parsed: ParsedAskQuery) -> float:
    name = _text(memory.get("item_name"))
    category = _text(memory.get("category"))
    intent_text = _text(memory.get("intent")).replace("_", " ")
    summary = _text(memory.get("summary"))
    details = _text(memory.get("extracted_text"))
    visual = _visual_text(memory.get("visual_context"))
    score = 0.0

    if parsed.terms:
        term_scores = []
        for term in parsed.terms:
            best = max(
                _word_match_score(term, name) * 1.8,
                _word_match_score(term, category) * 1.35,
                _word_match_score(term, intent_text) * 1.15,
                _word_match_score(term, summary),
                _word_match_score(term, details) * 0.8,
                _word_match_score(term, visual) * 0.65,
            )
            term_scores.append(best)
        score += sum(term_scores) / len(term_scores) * 0.62
    else:
        score += 0.08

    vector_similarity = float(memory.get("vector_similarity") or 0.0)
    if vector_similarity > 0:
        score += min(max(vector_similarity, 0.0), 1.0) * 0.22

    if parsed.colors:
        score += 0.12
    if parsed.intent:
        score += 0.10

    score += 0.025 * _recency_score(memory.get("last_seen"))
    frequency = max(int(memory.get("frequency") or 1), 1)
    score += min(math.log2(frequency + 1) / 12.0, 0.015)
    return score


def _has_relevance_evidence(memory: dict, parsed: ParsedAskQuery, score: float) -> bool:
    if score <= 0:
        return False

    searchable, visual = _searchable(memory)
    combined = f"{searchable} {visual}"
    term_hits = sum(1 for term in parsed.terms if _word_match_score(term, combined) > 0)
    vector_similarity = float(memory.get("vector_similarity") or 0.0)

    if parsed.terms:
        return term_hits > 0 or vector_similarity >= 0.66

    if parsed.colors or parsed.intent or parsed.since_days is not None or parsed.before_days is not None:
        return True

    return False


def _merge_candidates(*groups: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for group in groups:
        for row in group:
            memory_id = str(row.get("id") or "")
            if not memory_id:
                continue
            existing = merged.get(memory_id)
            if existing is None:
                merged[memory_id] = dict(row)
                continue
            vector_similarity = row.get("vector_similarity")
            if vector_similarity is not None:
                existing["vector_similarity"] = vector_similarity
    return list(merged.values())


def _ensure_recent_embeddings(client, user_id: str) -> None:
    try:
        result = (
            client.table("memories")
            .select("id,item_name,category,intent,summary,extracted_text,visual_context")
            .eq("user_id", user_id)
            .is_("embedding", "null")
            .order("last_seen", desc=True)
            .limit(LAZY_EMBED_LIMIT)
            .execute()
        )
        memories = result.data or []
        if memories:
            updated = persist_memory_embeddings(client, memories)
            logger.info("Lazily embedded %d memories for user %s", updated, user_id)
    except Exception:
        logger.warning("Lazy memory embedding failed; continuing without vectors", exc_info=True)


def _fetch_vector_candidates(client, user_id: str, parsed: ParsedAskQuery) -> list[dict]:
    semantic_query = " ".join((*parsed.terms, *parsed.colors)).strip() or parsed.raw.strip()
    if not semantic_query:
        return []
    try:
        vector = embed_text(semantic_query)
        if not vector:
            return []
        result = client.rpc(
            "search_memories_vector",
            {
                "p_user_id": user_id,
                "p_query_embedding": vector_literal(vector),
                "p_limit": VECTOR_CANDIDATE_LIMIT,
            },
        ).execute()
        return result.data or []
    except Exception:
        logger.warning("Vector retrieval unavailable; continuing with lexical retrieval", exc_info=True)
        return []


def _fetch_lexical_candidates(client, user_id: str, parsed: ParsedAskQuery) -> list[dict]:
    search_query = " ".join((*parsed.terms, *parsed.colors)).strip()
    if search_query:
        for rpc_name in ("search_memories_hybrid", "search_memories_fts"):
            try:
                result = client.rpc(
                    rpc_name,
                    {"p_user_id": user_id, "p_query": search_query, "p_limit": CANDIDATE_LIMIT},
                ).execute()
                if result.data:
                    return result.data
            except Exception:
                logger.info("%s unavailable; trying fallback", rpc_name, exc_info=True)

    result = (
        client.table("memories")
        .select("id,screenshot_id,intent,category,item_name,summary,extracted_text,visual_context,frequency,last_seen")
        .eq("user_id", user_id)
        .order("last_seen", desc=True)
        .limit(CANDIDATE_LIMIT)
        .execute()
    )
    return result.data or []


def _fetch_candidates(client, user_id: str, parsed: ParsedAskQuery) -> list[dict]:
    _ensure_recent_embeddings(client, user_id)
    lexical = _fetch_lexical_candidates(client, user_id, parsed)
    vector = _fetch_vector_candidates(client, user_id, parsed)
    return _merge_candidates(lexical, vector)


def retrieve_memories(user_id: str, parsed: ParsedAskQuery, top_k: int = DEFAULT_TOP_K) -> list[dict]:
    client = get_client()
    candidates = [
        memory
        for memory in _fetch_candidates(client, user_id, parsed)
        if _in_time_window(memory, parsed) and _passes_explicit_constraints(memory, parsed)
    ]

    ranked = [(score_memory(memory, parsed), memory) for memory in candidates]
    ranked.sort(key=lambda pair: pair[0], reverse=True)

    matches = [
        memory
        for score, memory in ranked
        if score >= 0.20 and _has_relevance_evidence(memory, parsed, score)
    ]
    return matches[:top_k]


def compose_retrieval_answer(parsed: ParsedAskQuery, memories: list[dict]) -> str:
    if not memories:
        if parsed.colors:
            return f"I couldn't find a saved memory matching {', '.join(parsed.colors)}."
        return "I couldn't find a matching saved memory."

    if len(memories) == 1:
        return f"Found 1 relevant memory: {memories[0]['item_name']}."

    names = [str(memory.get("item_name") or "Saved item").strip() for memory in memories[:5]]
    suffix = "" if len(memories) <= 5 else f" and {len(memories) - 5} more"
    return f"Found {len(memories)} relevant memories: {', '.join(names)}{suffix}."
