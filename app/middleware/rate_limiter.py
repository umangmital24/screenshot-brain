from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse

from app.services.distributed_limiter import allow_request


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Global API rate limiting with Redis support and a local fallback."""

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ("/", "/health", "/billing/webhook"):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        identity = auth_header if auth_header.startswith("Bearer ") else (request.client.host if request.client else "anonymous")
        allowed, retry_after = await allow_request(
            "api",
            identity,
            self.max_requests,
            self.window_seconds,
        )
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please slow down.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)


# Compatibility alias for older imports.
InMemoryRateLimiterMiddleware = RateLimiterMiddleware
