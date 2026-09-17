# Samhaal — AI Screenshot Memory

**Turn screenshots into memories you can actually find again.**

Samhaal is a privacy-first AI memory product for the screenshots people save and forget — books, products, recipes, places, posts, ideas, job opportunities, and more.

Instead of treating every screenshot as just another image, Samhaal extracts useful context, organizes it into structured memories, and lets you retrieve it later with natural language.

## Why Samhaal

Your gallery remembers **pixels**. Samhaal remembers **why you saved them**.

Ask things like:

- “What was that café I saved last month?”
- “Show me the pasta recipe from my screenshots.”
- “Which AI job post did I save?”
- “What books have I wanted to read?”

## Core Product Flow

1. Capture or share a screenshot from Android.
2. On-device ML Kit extracts OCR and visual signals.
3. The capture is stored durably in a local SQLite outbox.
4. WorkManager syncs pending captures when network conditions allow.
5. FastAPI processes an idempotent capture job.
6. Gemini extracts semantic information and converts it into a structured memory.
7. Samhaal indexes that memory for fast natural-language retrieval.
8. The original screenshot remains local in the normal Android privacy-first flow.

## Privacy & Security by Design

Samhaal treats privacy as part of the architecture rather than a later add-on.

- **Raw screenshots stay local** in the normal Android capture flow.
- **User-scoped database access** is enforced with Supabase Row Level Security.
- **User-scoped storage policies** restrict screenshot objects to their owner.
- **Server-only waitlist access** avoids exposing public client read/write policies.
- **Retrieval-first Ask flow** answers straightforward searches without sending them to an LLM.
- For reasoning questions, only the **top retrieved memories** are sent to Gemini instead of the entire memory store.
- Per-user rate limits, concurrency controls, retries, and retrieval fallbacks protect model-backed flows.

See [`README_ARCHITECTURE.md`](README_ARCHITECTURE.md) for the production architecture.

## Ask Samhaal

The retrieval pipeline is designed to avoid unnecessary model calls.

- A deterministic parser first classifies the question as **retrieval-only** or **reasoning-required**.
- Retrieval uses **PostgreSQL full-text search + trigram fuzzy search**.
- Results are ranked using metadata, visual signals, intent, frequency, and recency.
- Retrieval-only questions return directly.
- Reasoning questions send only the highest-ranked memories to Gemini.

## Reliability

Samhaal uses production-oriented capture and reasoning controls:

- SQLite-backed durable capture outbox
- WorkManager network-aware sync
- Idempotent capture jobs
- Durable worker retries
- Gemini quota-aware retry/backoff
- Per-user reasoning RPM limits
- Global model concurrency limits
- Retrieval fallback when model reasoning is unavailable

## Architecture

```text
Android Capture / Share
        |
        v
On-device ML Kit
(OCR + visual signals)
        |
        v
SQLite Outbox + WorkManager
        |
        v
FastAPI Capture API
        |
        v
Durable Capture Worker
        |
        +----> Gemini semantic extraction
        |
        v
Supabase / PostgreSQL Memories
        |
        v
Retrieval + Ask Samhaal
```

## Tech Stack

**Mobile:** Android · ML Kit · SQLite · WorkManager  
**Backend:** Python · FastAPI  
**Data:** Supabase · PostgreSQL · Row Level Security  
**AI:** Google Gemini · semantic extraction · retrieval-augmented reasoning  
**Search:** PostgreSQL full-text search · trigram fuzzy search · metadata ranking

## Repository Structure

```text
android_app/          Android capture and local persistence
app/                  FastAPI application
migrations/           Database migrations
scripts/              Supporting scripts
 tests/                Backend tests
rls_policies.sql      User-isolation and storage security policies
README_ARCHITECTURE.md Production architecture details
```

## Backend Setup

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available locally through FastAPI, with interactive documentation exposed by the application configuration.

## Product Direction

Samhaal is being built around one idea: **saving information should make it easier to remember, not harder to find.**

The goal is a fast, low-friction memory layer where capture feels as natural as taking a screenshot while retrieval feels as natural as asking a question.
