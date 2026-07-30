import os
import json
from google import genai
from google.genai import types
from app.models.schema import VisionExtraction

VALID_INTENTS = {
    "READ_LATER", "WATCH_LATER", "BUY_LATER", "COOK_LATER",
    "VISIT_LATER", "LEARN_LATER", "APPLY_LATER", "TRY_LATER",
}

SYSTEM_PROMPT = """You are an intent-extraction engine for a screenshot memory app.
Given a screenshot image, extract the user's underlying INTENT for saving it.

Return ONLY valid JSON (no markdown fences, no preamble, no explanation) matching this schema:
{
  "intent": one of ["READ_LATER","WATCH_LATER","BUY_LATER","COOK_LATER","VISIT_LATER","LEARN_LATER","APPLY_LATER","TRY_LATER"],
  "category": short string (e.g. "Books", "Electronics", "Recipes", "Travel"),
  "items": [{"name": string, "type": string}],
  "summary": one sentence describing why someone would save this
}

If the screenshot contains multiple distinct items (e.g. a "Top 5 books" list), include all of them in "items".
If unsure of intent, make your best guess from context - never leave it blank.
"""

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ["GEMINI_API_KEY"]
        _client = genai.Client(api_key=api_key)
    return _client


def _call_gemini(image_bytes: bytes, mime_type: str, strict_retry: bool = False) -> str:
    client = _get_client()
    model = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.5-flash")

    prompt = SYSTEM_PROMPT
    if strict_retry:
        prompt += "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the raw JSON object, nothing else."

    response = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ],
        config=types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",  # forces valid JSON output
        ),
    )
    return response.text


def _parse_json_response(raw: str) -> dict:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()
    return json.loads(cleaned)


def extract_intent_from_screenshot(image_bytes: bytes, mime_type: str = "image/png") -> VisionExtraction:
    """Calls Gemini and returns a validated VisionExtraction.
    Retries once with a stricter prompt if JSON parsing fails."""
    raw = _call_gemini(image_bytes, mime_type, strict_retry=False)

    try:
        parsed = _parse_json_response(raw)
    except (json.JSONDecodeError, ValueError):
        raw_retry = _call_gemini(image_bytes, mime_type, strict_retry=True)
        parsed = _parse_json_response(raw_retry)  # let this raise if it fails again

    intent = parsed.get("intent", "").upper().strip()
    if intent not in VALID_INTENTS:
        intent = "TRY_LATER"
    parsed["intent"] = intent

    return VisionExtraction(**parsed)
