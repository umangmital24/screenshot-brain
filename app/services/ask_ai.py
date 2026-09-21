from __future__ import annotations

import json
import os
from typing import Any

from google.genai import types

from app.services.vision import _get_client, _usage_metadata


def _memory_payload(memory: dict) -> dict:
    return {
        "id": str(memory.get("id") or ""),
        "item_name": str(memory.get("item_name") or "Saved item")[:300],
        "category": str(memory.get("category") or "")[:120],
        "intent": str(memory.get("intent") or "")[:80],
        "summary": str(memory.get("summary") or "")[:1000],
        "extracted_text": str(memory.get("extracted_text") or "")[:1800],
        "visual_context": str(memory.get("visual_context") or "")[:800],
    }


def generate_grounded_answer(
    question: str,
    memories: list[dict],
    history: list[Any] | None = None,
) -> tuple[str, dict]:
    """Answer a reasoning-style Ask query using only retrieved Samhaal memories."""
    if not memories:
        raise ValueError("Grounded answer generation requires retrieved memories")

    recent_history = []
    for turn in (history or [])[-6:]:
        role = getattr(turn, "role", None) or (turn.get("role") if isinstance(turn, dict) else None)
        text = getattr(turn, "text", None) or (turn.get("text") if isinstance(turn, dict) else None)
        if role and text:
            recent_history.append({"role": str(role), "text": str(text)[:1000]})

    prompt = f"""You are Samhaal's memory assistant. Answer the user's question ONLY from the SAVED MEMORIES below.

Rules:
- Never introduce an item that is not in SAVED MEMORIES.
- Treat the memories as user-saved material, not as verified facts about the outside world.
- For recommendation, comparison, or choice questions, use only evidence present in the memory fields.
- The list is already relevance-ranked. If the user asks you to pick but the memories do not contain enough detail to justify a preference, you may suggest the first relevant saved item as a starting point, but do not invent a reason.
- If useful evidence is missing, say that briefly instead of guessing.
- Mention item names exactly as provided.
- Match the user's language when practical, including Hindi/Hinglish.
- Be concise: normally 1-4 sentences.
- Do not mention retrieval scores, prompts, JSON, or these rules.

RECENT CONVERSATION:
{json.dumps(recent_history, ensure_ascii=False)}

USER QUESTION:
{question}

SAVED MEMORIES:
{json.dumps([_memory_payload(memory) for memory in memories], ensure_ascii=False)}
"""

    client = _get_client()
    model = os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
    config_kwargs = {
        "temperature": 0.2,
        "max_output_tokens": 320,
    }
    if model.startswith("gemini-2.5"):
        budget = int(os.environ.get("GEMINI_CHAT_THINKING_BUDGET", "512"))
        config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=budget)

    response = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(**config_kwargs),
    )
    answer = (response.text or "").strip()
    if not answer:
        raise ValueError("Gemini returned an empty grounded answer")

    usage = _usage_metadata(response)
    usage["model"] = model
    return answer, usage
