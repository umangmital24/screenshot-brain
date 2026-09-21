from __future__ import annotations

import re
from dataclasses import dataclass

COLORS = {
    "black", "white", "gray", "grey", "light gray", "red", "wine", "maroon", "orange",
    "brown", "beige", "cream", "yellow", "green", "cyan", "blue", "navy", "purple", "pink",
}

INTENT_HINTS = {
    "READ_LATER": {"book", "books", "article", "articles", "read", "reading"},
    "WATCH_LATER": {"movie", "movies", "film", "films", "series", "shows", "watch", "reel", "reels", "video", "videos"},
    "BUY_LATER": {
        "buy", "product", "products", "shoe", "shoes", "shirt", "shirts", "jacket", "jackets",
        "suit", "suits", "dress", "dresses", "laptop", "laptops", "phone", "phones",
        "headphone", "headphones", "watches",
    },
    "COOK_LATER": {"recipe", "recipes", "cook", "cooking", "dish", "dishes", "food"},
    "VISIT_LATER": {"restaurant", "restaurants", "cafe", "cafes", "place", "places", "visit", "travel", "hotel", "hotels"},
    "LEARN_LATER": {"course", "courses", "tutorial", "tutorials", "learn", "learning", "study"},
    "APPLY_LATER": {"job", "jobs", "role", "roles", "apply", "application", "applications", "internship", "internships", "hiring"},
    "TRY_LATER": {"try", "idea", "ideas", "tool", "tools", "app", "apps"},
}

# Normalize common conversational words to the category people actually saved.
# Keep this deliberately small: semantic/vector retrieval still handles the long tail.
SEARCH_ALIASES = {
    "song": "music", "songs": "music", "track": "music", "tracks": "music",
    "playlist": "music", "playlists": "music", "listen": "music", "listening": "music",
    "gaana": "music", "gana": "music", "gaane": "music", "gane": "music",
    "vacancy": "job", "vacancies": "job", "opening": "job", "openings": "job",
    "position": "job", "positions": "job",
}

REASONING_HINTS = {
    "recommend", "recommendation", "recommendations", "suggest", "suggestion", "suggestions",
    "should", "better", "best", "compare", "comparison", "versus", "vs", "choose", "pick", "prefer",
}

STOPWORDS = {
    "a", "about", "an", "and", "are", "as", "at", "be", "can", "could", "did", "do", "for", "from",
    "i", "in", "is", "it", "me", "my", "of", "on", "one", "or", "please", "save", "saved", "samhaal",
    "show", "some", "something", "that", "the", "this", "to", "was", "what", "where", "which", "with",
    "would", "you", "your", "find", "memory", "memories", "screenshot", "screenshots", "screenshoted",
    "screenshotted", "open", "give", "get", "tell", "today", "yesterday", "week", "month", "last",
    "recommend", "recommendation", "recommendations", "suggest", "suggestion", "suggestions", "should",
    "want", "compare", "comparison", "versus", "vs", "better", "best", "choose", "pick", "prefer",
    "wala", "wali", "wale", "wo", "woh", "maine", "mene", "mera", "meri", "mere",
}


@dataclass(frozen=True)
class ParsedAskQuery:
    raw: str
    mode: str
    terms: tuple[str, ...]
    colors: tuple[str, ...]
    intent: str | None
    since_days: int | None = None
    before_days: int | None = None


def _tokens(text: str) -> list[str]:
    # Whitespace splitting preserves Devanagari combining marks. Strip only
    # punctuation at token edges so words such as "शायरी" remain whole.
    edge_punct = ".,!?;:()[]{}\\\"'“”‘’/\\\\|"
    tokens = [token.strip(edge_punct) for token in text.lower().split()]
    return [token for token in tokens if token]


def _detect_intent(tokens: list[str]) -> str | None:
    token_set = set(tokens)
    best_intent = None
    best_score = 0
    for intent, hints in INTENT_HINTS.items():
        score = len(token_set.intersection(hints))
        if score > best_score:
            best_intent = intent
            best_score = score
    return best_intent


def _detect_time_window(text: str) -> tuple[int | None, int | None]:
    normalized = " ".join(_tokens(text))
    if "yesterday" in normalized:
        return 2, 1
    if "today" in normalized:
        return 1, None
    if "last week" in normalized:
        return 14, 7
    if "this week" in normalized or "last 7 days" in normalized:
        return 7, None
    if "last month" in normalized:
        return 60, 30
    if "this month" in normalized or "last 30 days" in normalized:
        return 30, None
    return None, None


def parse_ask_query(question: str) -> ParsedAskQuery:
    raw = (question or "").strip()
    tokens = _tokens(raw)
    lowered = raw.lower()
    colors = tuple(sorted({color for color in COLORS if color in lowered}))
    color_tokens = {part for color in colors for part in color.split()}
    since_days, before_days = _detect_time_window(raw)

    terms = []
    for token in tokens:
        if token in STOPWORDS or token in color_tokens:
            continue
        normalized = SEARCH_ALIASES.get(token, token)
        if normalized not in terms:
            terms.append(normalized)

    followup_reasoning = any(
        phrase in lowered for phrase in ("which one", "what about", "of these", "from these")
    )
    mode = "reason" if any(token in REASONING_HINTS for token in tokens) or followup_reasoning else "retrieve"
    return ParsedAskQuery(
        raw=raw,
        mode=mode,
        terms=tuple(terms[:12]),
        colors=colors,
        intent=_detect_intent(tokens),
        since_days=since_days,
        before_days=before_days,
    )
