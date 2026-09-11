import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

from app.routers import upload, memories, chat, waitlist, captures
from app.middleware.rate_limiter import InMemoryRateLimiterMiddleware

app = FastAPI(
    title="Samhaal API",
    description="Turns screenshots into structured, searchable memories.",
    version="1.2.0",
)

allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
allowed_origins = [o.strip().rstrip("/") for o in allowed_origins_env.split(",") if o.strip()]
allow_all_origins = allowed_origins == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Key"],
)
app.add_middleware(InMemoryRateLimiterMiddleware, max_requests=60, window_seconds=60)

app.include_router(captures.router)
app.include_router(upload.router)
app.include_router(memories.router)
app.include_router(chat.router)
app.include_router(waitlist.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API error: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An internal server error occurred. Please try again later."})


@app.get("/")
async def root():
    return {"status": "ok", "service": "samhaal-api", "version": "1.2.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
