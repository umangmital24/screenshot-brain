"""Regression tests for real Ask streaming and SSE framing."""
import json
from types import SimpleNamespace

from app.routers.chat import _sse_event
from app.services import ask_ai


def test_sse_event_has_wire_delimiter_and_json():
    event = _sse_event("token", text="Hello\nworld ✦")
    assert event.startswith("data: ")
    assert event.endswith("\n\n")
    payload = json.loads(event[len("data: "):-2])
    assert payload == {"type": "token", "text": "Hello\nworld ✦"}


def test_gemini_stream_uses_actual_text_deltas(monkeypatch):
    calls = []

    def fake_stream(**kwargs):
        calls.append(kwargs)
        return iter([
            SimpleNamespace(text="Found ", usage_metadata=None),
            SimpleNamespace(text="your book.", usage_metadata=None),
        ])

    fake_client = SimpleNamespace(models=SimpleNamespace(generate_content_stream=fake_stream))
    monkeypatch.setattr(ask_ai, "_get_client", lambda: fake_client)
    memory = {
        "id": "memory-a",
        "item_name": "A saved book",
        "intent": "READ_LATER",
    }
    parts = list(ask_ai.iter_grounded_answer_chunks("What did I save?", [memory]))

    assert [p["text"] for p in parts if p["type"] == "token"] == [
        "Found ", "your book.",
    ]
    assert parts[-1]["type"] == "usage"
    assert calls[0]["contents"][0].startswith("You are Samhaal's memory assistant.")
    assert calls[0]["model"]


def test_streamed_grounding_contains_only_retrieved_items(monkeypatch):
    class FakeModels:
        def generate_content_stream(self, **kwargs):
            assert "The Library Book" in kwargs["contents"][0]
            assert "SAVED MEMORIES:" in kwargs["contents"][0]
            return iter([SimpleNamespace(text="The Library Book", usage_metadata=None)])

    monkeypatch.setattr(ask_ai, "_get_client", lambda: SimpleNamespace(models=FakeModels()))
    result = list(ask_ai.iter_grounded_answer_chunks(
        "Which book?", [{"id": "1", "item_name": "The Library Book"}],
    ))
    assert result[0] == {"type": "token", "text": "The Library Book"}
