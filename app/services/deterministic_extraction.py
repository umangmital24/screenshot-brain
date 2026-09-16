from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.schema import VisionExtraction


@dataclass(frozen=True)
class DeterministicDecision:
    extraction: VisionExtraction | None
    confidence: float
    reason: str

    @property
    def matched(self) -> bool:
        return self.extraction is not None


ROLE_RE = re.compile(
    r"\b(?:ai|ml|software|data|backend|frontend|full[ -]?stack|product|cloud|devops|"
    r"machine learning|security|business|research)?\s*(?:engineer|developer|scientist|"
    r"analyst|manager|intern|architect|consultant)\b",
    re.IGNORECASE,
)
PRICE_RE = re.compile(r"(?:₹|rs\.?|inr|\$|usd|€|£)\s*[\d,.]+", re.IGNORECASE)
RATING_RE = re.compile(r"\b[1-5](?:\.\d)?\s*(?:★|stars?|/\s*5)\b", re.IGNORECASE)

NOISE_LINES = {
    "home", "search", "share", "save", "saved", "follow", "following", "like", "comment",
    "comments", "more", "see more", "see translation", "notifications", "messages", "menu",
    "add to cart", "buy now", "apply", "apply now", "easy apply", "directions", "call",
}

COMMERCE_SOURCES = (
    "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "shopping",
)
MAP_SOURCES = ("google.android.apps.maps", "maps", "zomato", "swiggy", "tripadvisor")
LINKEDIN_SOURCES = ("linkedin",)

PRODUCT_HINTS = {
    "shoe", "shoes", "shirt", "jacket", "dress", "laptop", "phone", "headphone", "headphones",
    "watch", "camera", "bag", "backpack", "helmet", "keyboard", "mouse", "monitor", "tablet",
    "ssd", "charger", "earbuds", "speaker", "jeans", "sneakers",
}
PLACE_HINTS = {"restaurant", "cafe", "coffee", "hotel", "resort", "bar", "bakery", "bistro"}
RECIPE_HINTS = {"recipe", "ingredients", "preheat", "serves", "tablespoon", "teaspoon", "tbsp", "tsp"}
COOKING_ACTIONS = {"bake", "boil", "cook", "fry", "mix", "stir", "roast", "grill", "simmer", "whisk"}


def _source_has(source: str | None, needles: tuple[str, ...]) -> bool:
    normalized = (source or "").lower()
    return any(needle in normalized for needle in needles)


def _clean_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip(" \t|•·-")
        if not line or len(line) < 3 or len(line) > 180:
            continue
        lowered = line.lower()
        if lowered in NOISE_LINES:
            continue
        if re.fullmatch(r"[\d\s:./%-]+", line):
            continue
        if line not in lines:
            lines.append(line)
    return lines


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def _best_line(
    lines: list[str],
    *,
    required_re: re.Pattern[str] | None = None,
    reject_price: bool = False,
    preferred_words: set[str] | None = None,
) -> str | None:
    candidates: list[tuple[float, str]] = []
    preferred_words = preferred_words or set()
    for index, line in enumerate(lines):
        if required_re and not required_re.search(line):
            continue
        if reject_price and PRICE_RE.search(line):
            continue
        alpha = sum(ch.isalpha() for ch in line)
        if alpha < 4:
            continue
        words = _tokens(line)
        score = 0.0
        score += min(alpha, 60) / 60.0
        score += 1.5 * len(words.intersection(preferred_words))
        if 6 <= len(line) <= 90:
            score += 0.7
        score += max(0.0, 0.35 - index * 0.025)
        candidates.append((score, line))
    return max(candidates, default=(0.0, None), key=lambda pair: pair[0])[1]


def _summary(title: str, detail: str) -> str:
    clean_detail = re.sub(r"\s+", " ", detail).strip()
    if clean_detail.lower().startswith(title.lower()):
        clean_detail = clean_detail[len(title):].lstrip(" :-–—")
    if not clean_detail:
        return title[:240]
    return f"{title} — {clean_detail[:220]}"[:300]


def _job_decision(text: str, lines: list[str], source: str | None) -> DeterministicDecision | None:
    lowered = text.lower()
    title = _best_line(lines, required_re=ROLE_RE)
    if not title:
        return None
    signals = sum(
        marker in lowered
        for marker in ("hiring", "job", "role", "requirements", "experience", "apply", "responsibilities")
    )
    if _source_has(source, LINKEDIN_SOURCES) and signals >= 2:
        confidence = 0.97
    elif signals >= 4:
        confidence = 0.95
    else:
        return None
    extraction = VisionExtraction(
        intent="APPLY_LATER",
        category="Jobs",
        items=[{"name": title[:300], "type": "job"}],
        summary=_summary(title, "Job opportunity saved for later"),
        extracted_text=text[:20_000],
    )
    return DeterministicDecision(extraction, confidence, "strong_job_signals")


def _recipe_decision(text: str, lines: list[str]) -> DeterministicDecision | None:
    lowered = text.lower()
    tokens = _tokens(text)
    recipe_signals = len(tokens.intersection(RECIPE_HINTS))
    action_signals = len(tokens.intersection(COOKING_ACTIONS))
    if "ingredients" not in lowered or recipe_signals < 2 or action_signals < 1:
        return None

    ingredients_index = next((i for i, line in enumerate(lines) if "ingredients" in line.lower()), None)
    before = lines[:ingredients_index] if ingredients_index is not None else lines[:4]
    title = _best_line(before, reject_price=True) or _best_line(lines[:5], reject_price=True)
    if not title or title.lower() in RECIPE_HINTS:
        return None
    extraction = VisionExtraction(
        intent="COOK_LATER",
        category="Recipes",
        items=[{"name": title[:300], "type": "recipe"}],
        summary=_summary(title, "Recipe with ingredients and cooking steps"),
        extracted_text=text[:20_000],
    )
    return DeterministicDecision(extraction, 0.97, "ingredients_and_cooking_steps")


def _product_decision(text: str, lines: list[str], source: str | None) -> DeterministicDecision | None:
    if not _source_has(source, COMMERCE_SOURCES) or not PRICE_RE.search(text):
        return None
    product_words = _tokens(text).intersection(PRODUCT_HINTS)
    if not product_words:
        return None
    title = _best_line(lines, reject_price=True, preferred_words=PRODUCT_HINTS)
    if not title or not _tokens(title).intersection(PRODUCT_HINTS):
        return None
    extraction = VisionExtraction(
        intent="BUY_LATER",
        category="Products",
        items=[{"name": title[:300], "type": "product"}],
        summary=_summary(title, "Product saved for later"),
        extracted_text=text[:20_000],
    )
    return DeterministicDecision(extraction, 0.96, "commerce_source_product_and_price")


def _place_decision(text: str, lines: list[str], source: str | None) -> DeterministicDecision | None:
    if not _source_has(source, MAP_SOURCES):
        return None
    place_words = _tokens(text).intersection(PLACE_HINTS)
    has_location_signal = bool(RATING_RE.search(text)) or any(
        marker in text.lower() for marker in ("directions", "open now", "closes", "address", "km away")
    )
    if not place_words or not has_location_signal:
        return None
    title = _best_line(lines, reject_price=True, preferred_words=PLACE_HINTS)
    if not title:
        return None
    extraction = VisionExtraction(
        intent="VISIT_LATER",
        category="Places",
        items=[{"name": title[:300], "type": "place"}],
        summary=_summary(title, "Place saved to visit later"),
        extracted_text=text[:20_000],
    )
    return DeterministicDecision(extraction, 0.95, "map_source_place_and_location_signal")


def extract_deterministically(
    extracted_text: str,
    entities: dict | None = None,
    app_source: str | None = None,
    ocr_blocks: list[dict] | None = None,
) -> DeterministicDecision:
    """Return a high-confidence extraction or an explicit fallback decision.

    This router is intentionally conservative. It only handles patterns where both
    the content and source/context provide enough independent evidence. Everything
    else falls through to Gemini.
    """
    del entities, ocr_blocks  # Reserved for later calibrated rules; do not guess from them yet.
    text = (extracted_text or "").strip()
    if not text:
        return DeterministicDecision(None, 0.0, "empty_text")

    lines = _clean_lines(text)
    if not lines:
        return DeterministicDecision(None, 0.0, "no_candidate_lines")

    decisions = [
        _job_decision(text, lines, app_source),
        _recipe_decision(text, lines),
        _product_decision(text, lines, app_source),
        _place_decision(text, lines, app_source),
    ]
    matched = [decision for decision in decisions if decision is not None]
    if not matched:
        return DeterministicDecision(None, 0.0, "ambiguous")

    matched.sort(key=lambda decision: decision.confidence, reverse=True)
    if len(matched) > 1 and matched[0].confidence - matched[1].confidence < 0.03:
        return DeterministicDecision(None, matched[0].confidence, "conflicting_rules")
    return matched[0]
