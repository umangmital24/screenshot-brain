import os
from google import genai
from fastapi import APIRouter, Depends

from app.services.db import get_client
from app.services.auth import get_current_user_id
from app.models.schema import ChatRequest, ChatResponse

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

    result = client.table("memories").select("*").eq("user_id", user_id).execute()
    memories = result.data

    memory_lines = [
        f"- [{m['intent']}] {m['item_name']} (category: {m.get('category')}, saved {m['frequency']}x)"
        for m in memories
    ]
    context = "\n".join(memory_lines) if memory_lines else "No memories saved yet."

    system_prompt = (
        "You are a helpful assistant answering questions about the user's saved "
        "screenshot memories (things they wanted to read, buy, cook, visit, learn, "
        "or apply for later). Answer only from the memories listed below. Be concise.\n\n"
        f"MEMORIES:\n{context}"
    )

    gemini_client = _get_client()
    model = os.environ.get("GEMINI_CHAT_MODEL", "gemini-2.5-flash")

    response = gemini_client.models.generate_content(
        model=model,
        contents=[system_prompt, req.question],
    )

    return ChatResponse(answer=response.text, memories_used=len(memories))
