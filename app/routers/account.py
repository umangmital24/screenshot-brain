from fastapi import APIRouter, Depends

from app.services.auth import get_current_user_id
from app.services.entitlements import get_month_usage, get_user_entitlements

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/entitlements")
def entitlements(user_id: str = Depends(get_current_user_id)):
    payload = get_user_entitlements(user_id)
    limits = payload.get("entitlements") or {}

    capture_used = get_month_usage(user_id, "capture_processed")
    ask_used = get_month_usage(user_id, "ask_query")

    return {
        **payload,
        "usage": {
            "captures_this_month": capture_used,
            "ask_queries_this_month": ask_used,
        },
        "remaining": {
            "captures": _remaining(limits.get("captures_per_month"), capture_used),
            "ask_queries": _remaining(limits.get("ask_queries_per_month"), ask_used),
        },
    }


def _remaining(limit_value, used: int):
    if limit_value is None:
        return None
    try:
        return max(int(limit_value) - used, 0)
    except (TypeError, ValueError):
        return None
