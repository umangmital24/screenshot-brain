import os
import json
import asyncio
from google import genai
from fastapi import APIRouter, Depends

from app.services.db import get_client, get_signed_screenshot_url
from app.services.auth import get_current_user_id
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

    def _fetch_memories():
        return client.table("memories").select("*").eq("user_id", user_id).execute().data

    memories = await asyncio.to_thread(_fetch_memories)
    # Give every memory a short reference tag (M1, M2, ...) the model can cite back to us,
    # and include extracted_text so it can actually answer "what was the phone number" etc.
    memory_lines = []
    memories_by_tag = {}
    for i, m in enumerate(memories, start=1):
        tag = f"M{i}"
        memories_by_tag[tag] = m
        detail = f", details: {m['extracted_text']}" if m.get("extracted_text") else ""
        memory_lines.append(
            f"- [{tag}] [{m['intent']}] {m['item_name']} "
            f"(category: {m.get('category')}, saved {m['frequency']}x{detail})"
        )
    context = "\n".join(memory_lines) if memory_lines else "No memories saved yet."

    system_prompt = (
        "You are a helpful assistant answering questions about the user's saved "
        "screenshot memories (things they wanted to read, buy, cook, visit, learn, "
        "or apply for later). Answer only from the memories listed below, and use the "
        "'details' field when the user asks for concrete info like a phone number, "
        "address, price, or date. Be concise.\n\n"
        f"MEMORIES:\n{context}\n\n"
        "After your answer, on a new line, output exactly one line starting with "
        "'SOURCES:' followed by a comma-separated list of the tags (e.g. M1, M3) of the "
        "memories you actually used to answer. If none were used, write 'SOURCES: none'."
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

