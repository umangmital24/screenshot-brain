import os
import json
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_random_exponential, retry_if_exception_type
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
  "summary": one sentence describing why someone would save this,
  "extracted_text": verbatim copy of any concrete, reusable details visible in the image - phone numbers,
    email addresses, physical addresses, prices, dates/times, URLs, usernames, or codes. Keep the original
    formatting (e.g. "+91 98765 43210"). Join multiple details with " | ". Omit the field (null) if there is
    no such concrete data in the image - do not paraphrase or summarize this field.
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


@retry(
    wait=wait_random_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
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
    """Calls Gemini with raw image bytes (multimodal fallback)."""
    safe_mime = mime_type.lower()
    if "heic" in safe_mime or "heif" in safe_mime:
        safe_mime = "image/jpeg"
    elif not safe_mime.startswith("image/"):
        safe_mime = "image/png"

    raw = _call_gemini(image_bytes, safe_mime, strict_retry=False)

    try:
        parsed = _parse_json_response(raw)
    except (json.JSONDecodeError, ValueError):
        raw_retry = _call_gemini(image_bytes, safe_mime, strict_retry=True)
        parsed = _parse_json_response(raw_retry)

    intent = parsed.get("intent", "").upper().strip()
    if intent not in VALID_INTENTS:
        intent = "TRY_LATER"
    parsed["intent"] = intent

    if "items" not in parsed or not isinstance(parsed["items"], list) or len(parsed["items"]) == 0:
        parsed["items"] = [{"name": parsed.get("summary") or "Screenshot Item", "type": None}]

    return VisionExtraction(**parsed)


@retry(
    wait=wait_random_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=False,
)
def extract_intent_from_metadata(
    extracted_text: str,
    entities: dict | None = None,
    app_source: str | None = None,
) -> VisionExtraction:
    """
    Privacy-First Text-Only Classification:
    Calls Gemini using ONLY on-device extracted text and entities.
    Zero image bytes are transmitted to the LLM.
    """
    client = _get_client()
    model = os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.5-flash")

    entities_str = json.dumps(entities or {}, ensure_ascii=False)
    app_str = f"Source Application: {app_source}\n" if app_source else ""

    text_prompt = f"""{SYSTEM_PROMPT}

{app_str}On-Device Extracted Text:
\"\"\"{extracted_text}\"\"\"

Detected Entities:
{entities_str}
"""

    response = client.models.generate_content(
        model=model,
        contents=[text_prompt],
        config=types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    raw = response.text
    try:
        parsed = _parse_json_response(raw)
    except Exception:
        parsed = {
            "intent": "TRY_LATER",
            "category": "Notes",
            "items": [{"name": extracted_text[:40] if extracted_text else "Note", "type": None}],
            "summary": extracted_text[:100] if extracted_text else "Saved note",
            "extracted_text": extracted_text,
        }

    intent = parsed.get("intent", "").upper().strip()
    if intent not in VALID_INTENTS:
        intent = "TRY_LATER"
    parsed["intent"] = intent

    if "items" not in parsed or not isinstance(parsed["items"], list) or len(parsed["items"]) == 0:
        parsed["items"] = [{"name": parsed.get("summary") or "Screenshot Item", "type": None}]

    return VisionExtraction(**parsed)


