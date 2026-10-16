import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.services.db import get_client, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.services.entitlements import enforce_monthly_limit
from app.services.query_parser import parse_ask_query
from app.services.retrieval import retrieve_memories, compose_retrieval_answer
from app.services.ask_ai import generate_grounded_answer, iter_grounded_answer_chunks
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


def _sse_event(kind: str, **data) -> str:
    """Server-Sent Events frame, consumable through POST fetch() streaming."""
    return "data: " + json.dumps({"type": kind, **data}, ensure_ascii=False) + "\n\n"


@router.post("/stream")
async def chat_stream(req: ChatRequest, user_id: str = Depends(get_current_user_id)):
    """Stream grounded Ask tokens without changing Android's existing POST /chat.

    Authentication and monthly limits are checked before the stream opens.
    The stream sends status, metadata-only sources, token deltas and done/error.
    """
    enforce_monthly_limit(
        user_id=user_id,
        entitlement_key="ask_queries_per_month",
        usage_event_type="ask_query",
    )

    async def event_generator():
        parsed = _parse_with_history(req)
        client = get_client()
        metadata = {"mode": parsed.mode, "retrieved_count": 0}
        try:
            yield _sse_event("status", text="Searching your saved memories…")
            try:
                memories = await asyncio.to_thread(retrieve_memories, user_id, parsed, 8)
            except Exception:
                logger.exception("Streaming memory retrieval failed")
                yield _sse_event("error", message="Memory search is temporarily unavailable.")
                return

            metadata["retrieved_count"] = len(memories)
            # Do not sign or expose cloud image URLs in the metadata-only web stream.
            sources = [
                ChatSource(
                    memory_id=memory["id"],
                    screenshot_id=memory.get("screenshot_id"),
                    item_name=memory.get("item_name") or "Saved item",
                    intent=memory.get("intent"),
                    category=memory.get("category"),
                    summary=memory.get("summary"),
                    extracted_text=memory.get("extracted_text"),
                    visual_context=memory.get("visual_context"),
                    image_url=None,
                ).model_dump(mode="json")
                for memory in memories
            ]
            yield _sse_event("sources", sources=sources)

            answer_fallback = compose_retrieval_answer(parsed, memories)
            total_chars = 0
            completed = True
            model_usage = {}

            if parsed.mode == "reason" and memories:
                yield _sse_event("status", text="Putting your memories together…")
                queue = asyncio.Queue()
                loop = asyncio.get_running_loop()

                def generate_in_thread():
                    try:
                        for update in iter_grounded_answer_chunks(req.question, memories, req.history):
                            loop.call_soon_threadsafe(queue.put_nowait, update)
                    except Exception:
                        logger.warning("Gemini streaming unavailable for Ask", exc_info=True)
                        loop.call_soon_threadsafe(queue.put_nowait, {"type": "failed"})
                    finally:
                        loop.call_soon_threadsafe(queue.put_nowait, {"type": "end"})

                worker = asyncio.create_task(asyncio.to_thread(generate_in_thread))
                try:
                    while True:
                        update = await queue.get()
                        if update["type"] == "end":
                            break
                        if update["type"] == "token":
                            delta = update["text"]
                            if delta:
                                total_chars += len(delta)
                                yield _sse_event("token", text=delta)
                        elif update["type"] == "usage":
                            model_usage = update["data"]
                        elif update["type"] == "failed":
                            if total_chars:
                                completed = False
                                yield _sse_event("error", message="The answer stopped partway through. Please try again.")
                            break
                finally:
                    # Cancelling a to_thread task cannot forcibly interrupt an SDK
                    # network request, but avoids retaining the async task on exit.
                    if not worker.done():
                        worker.cancel()

            if completed:
                if total_chars == 0:
                    # Retrieval-only answers and LLM outages don't generate tokens;
                    # send their real result once rather than simulating typing.
                    yield _sse_event("token", text=answer_fallback)
                metadata["model"] = model_usage.get("model")
                metadata["provider_usage"] = {k: v for k, v in model_usage.items() if k != "model"}
                metadata["filters"] = {
                    "intent": parsed.intent,
                    "colors": list(parsed.colors),
                    "terms": list(parsed.terms),
                    "since_days": parsed.since_days,
                    "before_days": parsed.before_days,
                }
                await asyncio.to_thread(_record_usage, client, req, user_id, metadata)
                yield _sse_event("done", memories_used=len(memories))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unexpected Ask streaming error")
            yield _sse_event("error", message="Could not complete this answer. Please try again.")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
