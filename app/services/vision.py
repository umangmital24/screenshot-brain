import os
import json
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_random_exponential
from app.models.schema import VisionExtraction

VALID_INTENTS = {
    "READ_LATER", "WATCH_LATER", "BUY_LATER", "COOK_LATER",
    "VISIT_LATER", "LEARN_LATER", "APPLY_LATER", "TRY_LATER",
}

SYSTEM_PROMPT = """You are an intent-extraction engine for a screenshot memory app.
Your job is to infer what the user actually wanted to remember, not to turn every visible text fragment into a memory.

PRIMARY-SAVE-TARGET RULES:
1. Create ONE memory item by default: the single primary thing the user most likely intended to save.
2. Only create multiple items when the content itself clearly presents a real list/set of peer recommendations, such as "Top 5 books", "3 restaurants to try", or a product comparison with several intended items.
3. Do NOT create separate items from unrelated surrounding UI or incidental OCR text.
4. For social-media screenshots, identify the main content/recommendation in the central post/reel/card and ignore platform chrome and adjacent-feed noise.
5. Ignore unless essential to the primary memory:
   - usernames, page/account names, profile names
   - Follow/Like/Comment/Share/Save labels and counts
   - music/audio track labels or artist names used as background audio
   - timestamps, dates of posting, "See translation", "more", navigation labels
   - status bar text, battery/network/time indicators
   - partially visible next/previous posts
   - watermarks, logos, app UI controls
6. A creator/person name should only become the memory item when the screenshot is actually about that person.
7. A song/audio label should only become the memory item when visible content explicitly recommends that song/audio; background reel audio is not a saved item.
8. Prefer the semantic recommendation visible in the content over OCR ordering. Example: "If you liked Drishyam, watch Raat Akeli Hai" -> save Raat Akeli Hai.
9. Use source-app context as a prior, not as the answer itself. For example, LinkedIn makes job-role text more likely to be APPLY_LATER, Amazon makes product text more likely BUY_LATER, but the visible content still decides.
10. When OCR block geometry is available, prioritize prominent central blocks over tiny text near the top/bottom/edges. Blocks are normalized to the screen: left/top/width/height are between 0 and 1.

SUMMARY RULES:
- Write a short, useful memory summary describing the content itself.
- Do NOT write generic phrases such as "The user saved this screenshot...", "This screenshot contains...", or "The user wants to remember...".
- Prefer summaries like "Recommended if you liked Drishyam." or "AI Engineer role focused on Python, FastAPI and LLMs."

Return ONLY valid JSON matching this schema:
{
  "intent": one of ["READ_LATER","WATCH_LATER","BUY_LATER","COOK_LATER","VISIT_LATER","LEARN_LATER","APPLY_LATER","TRY_LATER"],
  "category": short specific string,
  "items": [{"name": string, "type": string}],
  "summary": one short sentence useful on a memory card,
  "extracted_text": verbatim copy of concrete, reusable details that belong to the primary saved content, or null
}

If unsure of intent, make your best guess from the primary content - never leave it blank.
"""

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


@retry(wait=wait_random_exponential(multiplier=1, min=1, max=10), stop=stop_after_attempt(3), reraise=True)
def _call_gemini(image_bytes: bytes, mime_type: str, strict_retry: bool = False) -> str:
    client = _get_client()
    model = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.5-flash")
    prompt = SYSTEM_PROMPT
    if strict_retry:
        prompt += "\n\nIMPORTANT: Return ONLY the raw JSON object."
    response = client.models.generate_content(
        model=model,
        contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
        config=types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json"),
    )
    return response.text


def _parse_json_response(raw: str) -> dict:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return json.loads(cleaned.strip())


def _normalize_extraction(parsed: dict, fallback_text: str | None = None) -> VisionExtraction:
    intent = parsed.get("intent", "").upper().strip()
    if intent not in VALID_INTENTS:
        intent = "TRY_LATER"
    parsed["intent"] = intent
    if "items" not in parsed or not isinstance(parsed["items"], list) or not parsed["items"]:
        parsed["items"] = [{"name": parsed.get("summary") or (fallback_text or "Screenshot Item")[:40], "type": None}]
    return VisionExtraction(**parsed)


def extract_intent_from_screenshot(image_bytes: bytes, mime_type: str = "image/png") -> VisionExtraction:
    safe_mime = mime_type.lower()
    if "heic" in safe_mime or "heif" in safe_mime:
        safe_mime = "image/jpeg"
    elif not safe_mime.startswith("image/"):
        safe_mime = "image/png"

    raw = _call_gemini(image_bytes, safe_mime, strict_retry=False)
    try:
        parsed = _parse_json_response(raw)
    except (json.JSONDecodeError, ValueError):
        parsed = _parse_json_response(_call_gemini(image_bytes, safe_mime, strict_retry=True))
    return _normalize_extraction(parsed)


@retry(wait=wait_random_exponential(multiplier=1, min=1, max=10), stop=stop_after_attempt(3), reraise=False)
def extract_intent_from_metadata(
    extracted_text: str,
    entities: dict | None = None,
    app_source: str | None = None,
    ocr_blocks: list[dict] | None = None,
) -> VisionExtraction:
    """Privacy-first classifier. No screenshot pixels are sent to the LLM."""
    client = _get_client()
    model = os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.5-flash")

    entities_str = json.dumps(entities or {}, ensure_ascii=False)
    blocks = ocr_blocks or []
    blocks_str = json.dumps(blocks, ensure_ascii=False, separators=(",", ":")) if blocks else "[]"
    app_str = app_source or "Unknown"

    text_prompt = f"""{SYSTEM_PROMPT}

Source Application / Android package:
{app_str}

On-Device Extracted Text:
\"\"\"{extracted_text}\"\"\"

Detected Entities:
{entities_str}

OCR BLOCKS WITH NORMALIZED SCREEN GEOMETRY:
{blocks_str}

GEOMETRY GUIDANCE:
- top near 0 is top of screen; top near 1 is bottom.
- left near 0 is left edge; left near 1 is right edge.
- Larger width/height usually means visually more prominent content.
- Prefer blocks centered roughly within the middle 70% of the screen when they form a coherent recommendation/title/card.
- Down-rank tiny status-bar/navigation/audio/user-handle blocks near screen edges unless they are clearly the saved subject.
- If geometry conflicts with plain OCR reading order, trust semantic visual grouping implied by geometry.
- Still create multiple memory items only for a genuine list of peer items.
"""

    response = client.models.generate_content(
        model=model,
        contents=[text_prompt],
        config=types.GenerateContentConfig(temperature=0.12, response_mime_type="application/json"),
    )

    try:
        parsed = _parse_json_response(response.text)
    except Exception:
        parsed = {
            "intent": "TRY_LATER",
            "category": "Notes",
            "items": [{"name": extracted_text[:40] if extracted_text else "Note", "type": None}],
            "summary": extracted_text[:100] if extracted_text else "Saved note",
            "extracted_text": extracted_text,
        }

    return _normalize_extraction(parsed, extracted_text)
