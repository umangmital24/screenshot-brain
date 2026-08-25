import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from app.routers import upload, memories, chat, billing
from app.middleware.rate_limiter import InMemoryRateLimiterMiddleware

app = FastAPI(
    title="Screenshot Memory API",
    description="The Catalog API: turns screenshots into structured intent memories.",
    version="1.0.0",
)

allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] if allowed_origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(InMemoryRateLimiterMiddleware, max_requests=60, window_seconds=60)

app.include_router(upload.router)
app.include_router(memories.router)
app.include_router(chat.router)
app.include_router(billing.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log internal error without leaking stack details to the client
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


@app.get("/")
async def root():
    return {"status": "ok", "service": "screenshot-memory-api", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

