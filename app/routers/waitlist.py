import os
import re
import hmac
import asyncio
import logging
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, field_validator
from typing import Optional

from app.services.db import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/waitlist", tags=["waitlist"])


class WaitlistEntry(BaseModel):
    name: str
    email: str
    platform: Optional[str] = "web"
    screenshot_habit: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        v = v.strip().lower()
        if len(v) > 254 or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Please provide a valid email address.")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 2 or len(v) > 100:
            raise ValueError("Name must be between 2 and 100 characters.")
        return v

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v):
        if v is None:
            return "web"
        value = v.strip().lower()
        return value[:40] or "web"


def _require_admin(x_admin_key: Optional[str]) -> None:
    configured_key = os.environ.get("ADMIN_API_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="Admin waitlist access is not configured.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, configured_key):
        raise HTTPException(status_code=401, detail="Unauthorized.")


@router.post("")
async def join_waitlist(entry: WaitlistEntry):
    client = get_client()

    def _persist():
        existing = client.table("waitlist").select("id,email").eq("email", entry.email).limit(1).execute()
        if existing.data:
            return True

        payload = {
            "name": entry.name,
            "email": entry.email,
            "platform": entry.platform or "web",
        }
        if entry.screenshot_habit:
            payload["screenshot_habit"] = entry.screenshot_habit[:200]
        result = client.table("waitlist").insert(payload).execute()
        if not result.data:
            raise RuntimeError("Waitlist insert returned no data")
        return False

    try:
        already_joined = await asyncio.to_thread(_persist)
    except Exception:
        logger.exception("Failed to persist waitlist signup")
        raise HTTPException(status_code=503, detail="We couldn't save your waitlist signup right now. Please try again.")

    return {
        "status": "success",
        "message": "You're already on the Samhaal early-access list." if already_joined else "You're on the Samhaal early-access list. We'll email you when your beta access is ready.",
        "email": entry.email,
        "already_joined": already_joined,
    }


@router.get("/count")
async def waitlist_count():
    client = get_client()

    def _count():
        return client.table("waitlist").select("id", count="exact").execute().count or 0

    try:
        count = await asyncio.to_thread(_count)
        return {"count": count, "active": True}
    except Exception:
        logger.exception("Waitlist count failed")
        raise HTTPException(status_code=503, detail="Waitlist count is temporarily unavailable.")


@router.get("/admin")
async def get_waitlist(
    x_admin_key: Optional[str] = Header(default=None, alias="X-Admin-Key"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    _require_admin(x_admin_key)
    client = get_client()

    def _fetch():
        result = (
            client.table("waitlist")
            .select("id,name,email,platform,screenshot_habit,created_at", count="exact")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return result.count or 0, result.data or []

    try:
        total, entries = await asyncio.to_thread(_fetch)
        return {"count": total, "limit": limit, "offset": offset, "entries": entries}
    except Exception:
        logger.exception("Waitlist admin fetch failed")
        raise HTTPException(status_code=503, detail="Unable to fetch waitlist.")
