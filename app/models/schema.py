from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MemoryItem(BaseModel):
    """A single extracted item from a screenshot (a book, product, recipe, etc.)"""
    name: str
    type: Optional[str] = None


class VisionExtraction(BaseModel):
    """Structured output expected from the vision model."""
    intent: str  # READ_LATER, BUY_LATER, COOK_LATER, VISIT_LATER, WATCH_LATER, LEARN_LATER, APPLY_LATER, TRY_LATER
    category: Optional[str] = None
    items: List[MemoryItem] = []
    summary: Optional[str] = None
    extracted_text: Optional[str] = None  # verbatim key details: phone numbers, addresses, prices, dates, etc.


class MemoryOut(BaseModel):
    id: str
    screenshot_id: str
    intent: str
    category: Optional[str] = None
    item_name: str
    item_type: Optional[str] = None
    summary: Optional[str] = None
    extracted_text: Optional[str] = None
    frequency: int
    last_seen: datetime
    created_at: datetime


class ChatRequest(BaseModel):
    question: str


class ChatSource(BaseModel):
    """A memory the chatbot actually drew on, with a clickable link back to the screenshot."""
    memory_id: str
    screenshot_id: str
    item_name: str
    extracted_text: Optional[str] = None
    image_url: str  # signed URL, valid ~1 hour


class ChatResponse(BaseModel):
    answer: str
    memories_used: int
    sources: List[ChatSource] = []
