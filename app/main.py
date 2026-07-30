from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.routers import upload, memories, chat

app = FastAPI(title="Screenshot Memory API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten once you deploy the frontend domain
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(memories.router)
app.include_router(chat.router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "screenshot-memory-api"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
