import time
import threading
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

class InMemoryRateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Production-grade Token Bucket In-Memory Rate Limiter.
    Prevents API rate limit saturation, DDoS, and rogue scraper loops.
    """
    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.lock = threading.Lock()
        self.clients = {}  # { client_id: [timestamps] }

    async def dispatch(self, request: Request, call_next):
        # Exempt health checks and Stripe webhooks from rate limiting
        path = request.url.path
        if path in ("/", "/health", "/billing/webhook"):
            return await call_next(request)

        # Extract Client Identifier (Bearer Token user or Remote IP)
        auth_header = request.headers.get("Authorization", "")
        client_id = auth_header if auth_header.startswith("Bearer ") else (request.client.host if request.client else "anonymous")

        now = time.time()
        with self.lock:
            # Clean expired timestamps
            if client_id in self.clients:
                self.clients[client_id] = [
                    t for t in self.clients[client_id] if now - t < self.window_seconds
                ]
            else:
                self.clients[client_id] = []

            # Check if threshold exceeded
            if len(self.clients[client_id]) >= self.max_requests:
                retry_after = int(self.window_seconds - (now - self.clients[client_id][0]))
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded. Please slow down.",
                        "retry_after_seconds": max(1, retry_after),
                    },
                    headers={"Retry-After": str(max(1, retry_after))},
                )

            # Record this request
            self.clients[client_id].append(now)

        return await call_next(request)
