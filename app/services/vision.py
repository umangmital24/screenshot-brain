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
6. A creator/person name should only become the memory item when the screenshot is actually about that person (for example a profile, speaker, author, artist, or creator recommendation).
7. A song/audio label should only become the memory item when the visible content is explicitly recommending that song/audio; background reel audio is not a saved item.
8. Prefer the semantic recommendation visible in the content over OCR ordering. Example: if text says "If you liked Drishyam, watch Raat Akeli Hai", the saved item is "Raat Akeli Hai", not Drishyam, the account name, or the reel audio.

SUMMARY RULES:
- Write a short, useful memory summary describing the content itself.
- Do NOT write generic phrases such as "The user saved this screenshot...", "This screenshot contains...", or "The user wants to remember...".
- Prefer summaries like "Recommended if you liked Drishyam." or "AI Engineer role focused on Python, FastAPI and LLMs."

Return ONLY valid JSON (no markdown fences, no preamble, no explanation) matching this schema:
{
  "intent": one of ["READ_LATER","WATCH_LATER","BUY_LATER","COOK_LATER","VISIT_LATER","LEARN_LATER","APPLY_LATER","TRY_LATER"],
  "category": short specific string (e.g. "Books", "Movies", "Jobs", "Restaurants", "Electronics", "Recipes", "Travel"),
  "items": [{"name": string, "type": string}],
  "summary": one short sentence useful on a memory card,
  "extracted_text": verbatim copy of concrete, reusable details that belong to the primary saved content - such as phone numbers,
    email addresses, physical addresses, prices, dates/times, URLs, usernames, codes, or a short key recommendation phrase. Do not include
    unrelated app chrome or adjacent-feed text. Keep original formatting where useful. Omit the field (null) if there is no useful concrete data.
}

Examples:
- Social reel text: "If You Liked Drishyam, Watch Raat Akeli Hai" plus usernames/audio/UI -> one item: Raat Akeli Hai, type Movie, WATCH_LATER, category Movies.
- Post titled "5 books every engineer should read" with five clearly listed book titles -> five book items are allowed.
- Shopping post showing one featured pair of shoes plus creator username and background song -> one item: the shoes/product, not the creator or song.

If unsure of intent, make your best guess from the primary content - never leave it blank.
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
            response_mime_type="application/json",
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

IMPORTANT FOR OCR-ONLY INPUT:
The OCR text may contain the entire phone screen in reading order, including status bar text, social-media usernames, audio labels,
engagement counts, captions, adjacent posts, and navigation. Reconstruct the likely visual hierarchy from the text and choose the
single primary save target unless there is clear evidence of a genuine multi-item recommendation list.
"""

    response = client.models.generate_content(
        model=model,
        contents=[text_prompt],
        config=types.GenerateContentConfig(
            temperature=0.15,
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
