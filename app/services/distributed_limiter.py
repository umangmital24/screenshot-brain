from __future__ import annotations

import asyncio
import hashlib
import os
import time
from collections import defaultdict, deque

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover - Redis is optional at runtime
    Redis = None

_REDIS_URL = os.environ.get("REDIS_URL", "").strip()
_redis = Redis.from_url(_REDIS_URL, encoding="utf-8", decode_responses=True) if (_REDIS_URL and Redis) else None
_lock = asyncio.Lock()
_local: dict[str, deque[float]] = defaultdict(deque)


def safe_client_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()[:32]


async def allow_request(scope: str, identity: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds).

    Redis is used when REDIS_URL is configured, making limits consistent across
    multiple API instances. A bounded in-process fallback keeps local/dev usable.
    """
    if limit <= 0:
        return True, 0

    key_identity = safe_client_key(identity)
    bucket = int(time.time() // window_seconds)
    redis_key = f"samhaal:rl:{scope}:{key_identity}:{bucket}"

    if _redis is not None:
        try:
            async with _redis.pipeline(transaction=True) as pipe:
                pipe.incr(redis_key)
                pipe.expire(redis_key, window_seconds + 2, nx=True)
                count, _ = await pipe.execute()
            allowed = int(count) <= limit
            retry_after = max(1, window_seconds - int(time.time() % window_seconds)) if not allowed else 0
            return allowed, retry_after
        except Exception:
            # Availability is more important than failing closed when Redis is briefly unavailable.
            pass

    local_key = f"{scope}:{key_identity}"
    now = time.time()
    async with _lock:
        queue = _local[local_key]
        while queue and now - queue[0] >= window_seconds:
            queue.popleft()
        if len(queue) >= limit:
            retry_after = max(1, int(window_seconds - (now - queue[0])))
            return False, retry_after
        queue.append(now)
        if not queue:
            _local.pop(local_key, None)
    return True, 0
