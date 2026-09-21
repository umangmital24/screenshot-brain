import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException

from app.services.db import get_client, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.services.entitlements import enforce_monthly_limit
from app.services.query_parser import parse_ask_query
from app.services.retrieval import retrieve_memories, compose_retrieval_answer
from app.services.ask_ai import generate_grounded_answer
from app.models.schema import ChatRequest, ChatResponse, ChatSource

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


def _parse_with_history(req: ChatRequest):
    parsed = parse_ask_query(req.question)
    has_constraints = bool(
        parsed.terms or parsed.colors or parsed.intent
        or parsed.since_days is not None or parsed.before_days is not None
    )
    if has_constraints:
        return parsed

    # Follow-ups such as "which one?" need the subject from the previous user
    # turn. Only borrow context when the current turn has no useful retrieval
    # constraints of its own.
    for turn in reversed(req.history):
        if turn.role != "user":
            continue
        prior = parse_ask_query(turn.text)
        if prior.terms or prior.colors or prior.intent:
            return parse_ask_query(f"{turn.text} {req.question}")
    return parsed


async def _build_sources(client, user_id: str, memories: list[dict]) -> list[ChatSource]:
    screenshot_ids = list({m["screenshot_id"] for m in memories if m.get("screenshot_id")})

    def _fetch_screenshot_paths():
        if not screenshot_ids:
            return {}
        res = (
            client.table("screenshots")
            .select("id,image_url")
            .eq("user_id", user_id)
            .in_("id", screenshot_ids)
            .execute()
        )
        return {row["id"]: row.get("image_url") for row in (res.data or [])}

    try:
        path_map = await asyncio.to_thread(_fetch_screenshot_paths)
    except Exception:
        logger.warning("Could not fetch screenshot paths for search sources", exc_info=True)
        path_map = {}

    sources: list[ChatSource] = []
    for memory in memories:
        signed_url = None
        storage_path = path_map.get(memory.get("screenshot_id"))
        if storage_path:
            try:
                signed_url = await asyncio.to_thread(get_signed_screenshot_url, storage_path)
            except Exception:
                logger.warning("Could not sign screenshot source URL", exc_info=True)

        sources.append(ChatSource(
            memory_id=memory["id"],
            screenshot_id=memory.get("screenshot_id"),
            item_name=memory["item_name"],
            intent=memory.get("intent"),
            category=memory.get("category"),
            summary=memory.get("summary"),
            extracted_text=memory.get("extracted_text"),
            visual_context=memory.get("visual_context"),
            image_url=signed_url,
        ))
    return sources


def _record_usage(client, req: ChatRequest, user_id: str, metadata: dict) -> None:
    try:
        usage_key = f"ask:{req.client_request_id}" if req.client_request_id else None
        client.table("usage_events").insert({
            "user_id": user_id,
            "event_type": "ask_query",
            "quantity": 1,
            "idempotency_key": usage_key,
            "reference_type": "chat",
            "metadata": metadata,
        }).execute()
    except Exception:
        logger.info("Search usage event was not inserted (likely replay)", exc_info=True)


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, user_id: str = Depends(get_current_user_id)):
    """Natural-language retrieval with grounded reasoning when the query needs it."""
    enforce_monthly_limit(
        user_id=user_id,
        entitlement_key="ask_queries_per_month",
        usage_event_type="ask_query",
    )

    client = get_client()
    parsed = _parse_with_history(req)

    try:
        memories = await asyncio.to_thread(retrieve_memories, user_id, parsed, 8)
    except Exception:
        logger.exception("Memory retrieval failed")
        raise HTTPException(status_code=503, detail="Memory search is temporarily unavailable.")

    answer = compose_retrieval_answer(parsed, memories)
    ai_usage: dict = {}
    if parsed.mode == "reason" and memories:
        try:
            answer, ai_usage = await asyncio.to_thread(
                generate_grounded_answer,
                req.question,
                memories,
                req.history,
            )
        except Exception:
            # Search results remain useful even if Gemini is rate-limited or
            # temporarily unavailable. Never turn an Ask reasoning failure into
            # a failed search.
            logger.warning("Grounded Ask answer generation failed; using retrieval fallback", exc_info=True)

    sources = await _build_sources(client, user_id, memories)

    await asyncio.to_thread(_record_usage, client, req, user_id, {
        "mode": parsed.mode,
        "model": ai_usage.get("model"),
        "retrieved_count": len(memories),
        "provider_usage": {key: value for key, value in ai_usage.items() if key != "model"},
        "filters": {
            "intent": parsed.intent,
            "colors": list(parsed.colors),
            "terms": list(parsed.terms),
            "since_days": parsed.since_days,
            "before_days": parsed.before_days,
        },
    })

    return ChatResponse(answer=answer, memories_used=len(memories), sources=sources)
