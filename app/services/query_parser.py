from __future__ import annotations

import re
from dataclasses import dataclass

REASONING_TERMS = {
    "compare", "comparison", "summarize", "summary", "recommend", "recommendation",
    "best", "better", "worse", "why", "explain", "choose", "pick", "rank", "ranking",
    "pros", "cons", "difference", "differences", "similarities", "should i", "which is better",
    "which one", "what about", "first one", "second one", "third one", "the first", "the second", "the third",
}

COLORS = {
    "black", "white", "gray", "grey", "light gray", "red", "wine", "maroon", "orange",
    "brown", "beige", "cream", "yellow", "green", "cyan", "blue", "navy", "purple", "pink",
}

INTENT_HINTS = {
    "READ_LATER": {"book", "books", "article", "articles", "read", "reading"},
    "WATCH_LATER": {"movie", "movies", "film", "films", "series", "show", "shows", "watch", "reel", "video"},
    "BUY_LATER": {"buy", "product", "products", "shoe", "shoes", "shirt", "shirts", "jacket", "jackets", "laptop", "phone"},
    "COOK_LATER": {"recipe", "recipes", "cook", "cooking", "dish", "food"},
    "VISIT_LATER": {"restaurant", "restaurants", "cafe", "cafes", "place", "places", "visit", "travel", "hotel", "hotels"},
    "LEARN_LATER": {"course", "courses", "tutorial", "tutorials", "learn", "learning", "study"},
    "APPLY_LATER": {"job", "jobs", "role", "roles", "apply", "application", "internship", "internships"},
    "TRY_LATER": {"try", "idea", "ideas", "tool", "tools", "app", "apps"},
}

STOPWORDS = {
    "a", "about", "an", "and", "are", "as", "at", "be", "did", "do", "for", "from", "i", "in", "is",
    "it", "me", "my", "of", "on", "one", "or", "please", "save", "saved", "samhaal", "show", "that", "the",
    "this", "to", "was", "what", "where", "which", "with", "you", "find", "memory", "memories",
    "compare", "comparison", "summarize", "summary", "recommend", "recommendation", "best", "better", "worse",
    "why", "explain", "choose", "pick", "rank", "ranking", "first", "second", "third", "two",
    "today", "yesterday", "week", "month", "last",
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
    return re.findall(r"[a-z0-9+#.-]+", text.lower())


def _detect_mode(text: str) -> str:
    normalized = " ".join(_tokens(text))
    padded = f" {normalized} "
    for term in REASONING_TERMS:
        if " " in term:
            if term in normalized:
                return "reason"
        elif f" {term} " in padded:
            return "reason"
    return "retrieve"


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
        if token not in terms:
            terms.append(token)

    return ParsedAskQuery(
        raw=raw,
        mode=_detect_mode(raw),
        terms=tuple(terms[:12]),
        colors=colors,
        intent=_detect_intent(tokens),
        since_days=since_days,
        before_days=before_days,
    )
