from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime

VALID_INTENTS = {
    "READ_LATER", "WATCH_LATER", "BUY_LATER", "COOK_LATER",
    "VISIT_LATER", "LEARN_LATER", "APPLY_LATER", "TRY_LATER",
}


class MemoryItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    type: Optional[str] = Field(None, max_length=120)


class VisionExtraction(BaseModel):
    intent: str
    category: Optional[str] = Field(None, max_length=120)
    items: List[MemoryItem] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=1000)
    extracted_text: Optional[str] = Field(None, max_length=20_000)


class MemoryOut(BaseModel):
    id: str
    screenshot_id: str
    intent: str
    category: Optional[str] = None
    item_name: str
    item_type: Optional[str] = None
    summary: Optional[str] = None
    extracted_text: Optional[str] = None
    image_url: Optional[str] = None
    is_done: bool = False
    frequency: int
    last_seen: datetime
    created_at: datetime


class MemoryUpdate(BaseModel):
    is_done: Optional[bool] = None
    intent: Optional[str] = None
    category: Optional[str] = Field(None, max_length=120)
    item_name: Optional[str] = Field(None, min_length=1, max_length=300)
    summary: Optional[str] = Field(None, max_length=1000)

    @field_validator("intent")
    @classmethod
    def validate_intent(cls, value):
        if value is None:
            return value
        normalized = value.strip().upper()
        if normalized not in VALID_INTENTS:
            raise ValueError("Unsupported intent")
        return normalized


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)

    @field_validator("question")
    @classmethod
    def clean_question(cls, value):
        return value.strip()


class ChatSource(BaseModel):
    memory_id: str
    screenshot_id: str
    item_name: str
    extracted_text: Optional[str] = None
    image_url: str


class ChatResponse(BaseModel):
    answer: str
    memories_used: int
    sources: List[ChatSource] = Field(default_factory=list)
