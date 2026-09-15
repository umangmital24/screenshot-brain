import os
import asyncio
from google import genai
from fastapi import APIRouter, Depends

from app.services.db import get_client, get_signed_screenshot_url
from app.services.auth import get_current_user_id
from app.services.retrieval import retrieve_memories
from app.models.schema import ChatRequest, ChatResponse, ChatSource

router = APIRouter(prefix="/chat", tags=["chat"])

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, user_id: str = Depends(get_current_user_id)):
    client = get_client()

    # Retrieval happens before generation. Only the strongest candidates are sent to
    # Gemini, so Ask Samhaal scales with top-k instead of the user's total memory count.
    memories = await asyncio.to_thread(retrieve_memories, user_id, req.question)

    if not memories:
        return ChatResponse(
            answer="I couldn't find a saved memory matching that.",
            memories_used=0,
            sources=[],
        )

    memory_lines = []
    memories_by_tag = {}
    for i, m in enumerate(memories, start=1):
        tag = f"M{i}"
        memories_by_tag[tag] = m
        detail = f", details: {m['extracted_text']}" if m.get("extracted_text") else ""
        score = m.get("retrieval_score")
        score_text = f", retrieval_score: {float(score):.3f}" if score is not None else ""
        memory_lines.append(
            f"- [{tag}] [{m['intent']}] {m['item_name']} "
            f"(category: {m.get('category')}, saved {m['frequency']}x{score_text}{detail})"
        )
    context = "\n".join(memory_lines)

    system_prompt = (
        "You are Samhaal's memory retrieval formatter, not a general assistant. "
        "Your only job is to help the user recover information that exists in their "
        "saved screenshot memories below. Do not recommend, compare, advise, infer user "
        "preferences, or add outside knowledge. If the requested fact is not present, "
        "say you could not find it in the saved memories. Use the details field for "
        "concrete information such as phone numbers, addresses, prices and dates. "
        "Keep the answer concise and retrieval-focused.\n\n"
        f"RETRIEVED MEMORIES:\n{context}\n\n"
        "After your answer, on a new line, output exactly one line starting with "
        "'SOURCES:' followed by a comma-separated list of the tags (for example M1, M3) "
        "you actually used. If none were used, write 'SOURCES: none'."
    )

    gemini_client = _get_client()
    model = os.environ.get("GEMINI_CHAT_MODEL", "gemini-2.5-flash")

    def _generate():
        return gemini_client.models.generate_content(
            model=model,
            contents=[system_prompt, req.question],
        )

    response = await asyncio.to_thread(_generate)

    raw_text = response.text or ""
    answer = raw_text
    used_tags: list[str] = []

    if "SOURCES:" in raw_text:
        answer, _, sources_line = raw_text.rpartition("SOURCES:")
        answer = answer.strip()
        used_tags = [t.strip() for t in sources_line.strip().split(",") if t.strip() in memories_by_tag]

    sources = []
    if used_tags:
        used_memories = [memories_by_tag[tag] for tag in used_tags]
        screenshot_ids = list({m["screenshot_id"] for m in used_memories if m.get("screenshot_id")})

        def _fetch_screenshot_paths():
            if not screenshot_ids:
                return {}
            res = client.table("screenshots").select("id, image_url").in_("id", screenshot_ids).execute()
            return {row["id"]: row["image_url"] for row in (res.data or [])}

        path_map = await asyncio.to_thread(_fetch_screenshot_paths)

        for m in used_memories:
            storage_path = path_map.get(m.get("screenshot_id"))
            if not storage_path:
                continue
            try:
                signed_url = get_signed_screenshot_url(storage_path)
                sources.append(ChatSource(
                    memory_id=m["id"],
                    screenshot_id=m["screenshot_id"],
                    item_name=m["item_name"],
                    extracted_text=m.get("extracted_text"),
                    image_url=signed_url,
                ))
            except Exception:
                continue

    return ChatResponse(answer=answer, memories_used=len(memories), sources=sources)
