from __future__ import annotations

import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any

from app.services.db import get_client
from app.services.query_parser import ParsedAskQuery

logger = logging.getLogger(__name__)
CANDIDATE_LIMIT = 250
DEFAULT_TOP_K = 8


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
    if re.search(rf"\b{re.escape(term)}\b", haystack):
        return 1.0
    if term in haystack:
        return 0.55
    return 0.0


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


def score_memory(memory: dict, parsed: ParsedAskQuery) -> float:
    name = _text(memory.get("item_name"))
    category = _text(memory.get("category"))
    summary = _text(memory.get("summary"))
    details = _text(memory.get("extracted_text"))
    visual = _visual_text(memory.get("visual_context"))
    searchable = f"{name} {category} {summary} {details}"
    score = 0.0

    if parsed.terms:
        term_scores = []
        for term in parsed.terms:
            best = max(
                _word_match_score(term, name) * 1.8,
                _word_match_score(term, category) * 1.35,
                _word_match_score(term, summary),
                _word_match_score(term, details) * 0.8,
                _word_match_score(term, visual) * 0.65,
            )
            term_scores.append(best)
        score += sum(term_scores) / len(term_scores) * 0.68
    else:
        score += 0.15

    if parsed.colors:
        matched_colors = sum(1 for color in parsed.colors if color in visual or color in searchable)
        score += 0.18 * (matched_colors / len(parsed.colors)) if matched_colors else -0.12

    if parsed.intent:
        score += 0.09 if _text(memory.get("intent")) == parsed.intent.lower() else -0.02

    score += 0.035 * _recency_score(memory.get("last_seen"))
    frequency = max(int(memory.get("frequency") or 1), 1)
    score += min(math.log2(frequency + 1) / 10.0, 0.025)
    return score


def _fetch_candidates(client, user_id: str, parsed: ParsedAskQuery) -> list[dict]:
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


def retrieve_memories(user_id: str, parsed: ParsedAskQuery, top_k: int = DEFAULT_TOP_K) -> list[dict]:
    client = get_client()
    candidates = [m for m in _fetch_candidates(client, user_id, parsed) if _in_time_window(m, parsed)]
    ranked = [(score_memory(memory, parsed), memory) for memory in candidates]
    ranked.sort(key=lambda pair: pair[0], reverse=True)

    threshold = 0.16 if parsed.mode == "retrieve" else 0.10
    matches = [memory for score, memory in ranked if score >= threshold]
    if not matches and parsed.mode == "reason" and ranked:
        matches = [memory for _, memory in ranked[: min(top_k, 4)]]
    return matches[:top_k]


def compose_retrieval_answer(parsed: ParsedAskQuery, memories: list[dict]) -> str:
    if not memories:
        return "I couldn't find a matching saved memory."
    if len(memories) == 1:
        memory = memories[0]
        summary = (memory.get("summary") or "").strip()
        if summary:
            return f"I found {memory['item_name']}. {summary}"
        return f"I found {memory['item_name']} in your saved memories."

    names = [str(memory.get("item_name") or "Saved item").strip() for memory in memories[:5]]
    suffix = "" if len(memories) <= 5 else f" and {len(memories) - 5} more"
    return f"I found {len(memories)} matching memories: {', '.join(names)}{suffix}."
