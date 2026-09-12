# Samhaal production architecture

## Capture path

1. Android Save Bubble/share flow captures a screenshot reference.
2. ML Kit OCR and visual labels/colors run on-device.
3. A durable client event is stored in the native SQLite outbox.
4. WorkManager schedules a network-constrained sync when a capture is pending.
5. FastAPI `/captures` enqueues an idempotent capture event/job.
6. The capture worker leases the job, performs Gemini semantic extraction with capture thinking disabled by default, and finalizes memory rows.
7. Worker retries are durable and quota-aware; Gemini usage metadata is recorded for capture extraction.
8. Raw screenshots remain local for the normal privacy-first Android flow. Memory IDs map to local screenshot URIs in SQLite; missing/deleted files are represented explicitly.

## Ask path

1. A deterministic parser classifies a question as retrieval-only or reasoning-required.
2. Retrieval uses PostgreSQL full-text search + trigram fuzzy search, then application-side metadata, visual, intent, frequency and recency ranking.
3. Retrieval-only questions return directly without Gemini.
4. Reasoning questions send only the top retrieved memories to Gemini.
5. Gemini reasoning is protected by global concurrency, per-user RPM limits, bounded thinking, retry/backoff and retrieval fallback.

## Quota and rate limiting

- `GEMINI_CAPTURE_THINKING_BUDGET=0` by default.
- `GEMINI_CHAT_CONCURRENCY` bounds simultaneous reasoning requests.
- `ASK_REASONING_RPM` bounds model-backed Ask bursts per user.
- `GEMINI_CHAT_THINKING_BUDGET` bounds reasoning-token use.
- `CAPTURE_RETRY_BASE_SECONDS` controls durable capture retry spacing after transient failures.
- `REDIS_URL` enables distributed API/reasoning limits across multiple backend instances; without it, a single-instance in-memory fallback is used.

## Local Android persistence

Native SQLite stores pending capture outbox rows keyed by `client_event_id` and memory-to-local-screenshot references. Legacy AsyncStorage queue/media records are migrated into SQLite on first access. WorkManager provides network-aware retry scheduling plus a low-frequency repair sweep.

## Source of truth

Production backend branch: `backend-web-launch-hardening`.

`main` should be kept fast-forwarded to the same production-ready commit after validation.
