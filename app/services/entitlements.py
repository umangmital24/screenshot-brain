from __future__ import annotations

from datetime import datetime, timezone
from fastapi import HTTPException

from app.services.db import get_client


DEFAULT_PLAN = "free"


def get_user_entitlements(user_id: str) -> dict:
    """Return provider-neutral plan + entitlement values.

    Product logic should depend on entitlement keys, never on Stripe/Play-specific
    subscription fields. That keeps web and mobile billing interchangeable.
    """
    client = get_client()
    result = client.rpc("get_user_entitlements", {"p_user_id": user_id}).execute()
    payload = result.data or {"plan_code": DEFAULT_PLAN, "entitlements": {}}
    if isinstance(payload, list):
        payload = payload[0] if payload else {"plan_code": DEFAULT_PLAN, "entitlements": {}}
    return payload


def get_month_usage(user_id: str, event_type: str) -> int:
    client = get_client()
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    result = (
        client.table("usage_events")
        .select("quantity")
        .eq("user_id", user_id)
        .eq("event_type", event_type)
        .gte("created_at", month_start.isoformat())
        .execute()
    )
    return sum(int(row.get("quantity") or 0) for row in (result.data or []))


def enforce_monthly_limit(user_id: str, entitlement_key: str, usage_event_type: str) -> dict:
    """Raise 402 when a configured monthly allowance is exhausted.

    A null/missing entitlement is treated as unlimited for forward compatibility.
    """
    ent = get_user_entitlements(user_id)
    value = (ent.get("entitlements") or {}).get(entitlement_key)

    if value is None:
        return ent

    try:
        limit = int(value)
    except (TypeError, ValueError):
        return ent

    used = get_month_usage(user_id, usage_event_type)
    if used >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "plan_limit_reached",
                "plan": ent.get("plan_code", DEFAULT_PLAN),
                "entitlement": entitlement_key,
                "limit": limit,
                "used": used,
            },
        )
    return ent
