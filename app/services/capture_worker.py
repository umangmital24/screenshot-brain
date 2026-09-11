from __future__ import annotations

import json
import logging
import os
import socket
import time
from datetime import datetime, timedelta, timezone
from time import perf_counter

from app.services.db import get_client
from app.services.vision import extract_intent_from_metadata

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v3-primary-target-geometry"
SCHEMA_VERSION = "capture-extraction-v1"
MAX_ATTEMPTS = int(os.environ.get("CAPTURE_MAX_ATTEMPTS", "5"))
BASE_RETRY_SECONDS = int(os.environ.get("CAPTURE_RETRY_BASE_SECONDS", "15"))


def _worker_id() -> str:
    return os.environ.get("CAPTURE_WORKER_ID") or f"{socket.gethostname()}:{os.getpid()}"


def _record_extraction(
    capture_id: str,
    attempt: int,
    *,
    success: bool,
    model: str | None,
    normalized_result: dict | None = None,
    latency_ms: int | None = None,
    input_chars: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    client = get_client()
    client.table("capture_extractions").insert({
        "capture_id": capture_id,
        "attempt": attempt,
        "provider": "google",
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "schema_version": SCHEMA_VERSION,
        "normalized_result": normalized_result,
        "latency_ms": latency_ms,
        "input_chars": input_chars,
        "success": success,
        "error_type": error_type,
        "error_message": error_message,
    }).execute()


def _schedule_failure(capture_id: str, attempt: int, error: Exception) -> None:
    client = get_client()
    message = str(error)[:1000]

    if attempt >= MAX_ATTEMPTS:
        client.table("capture_events").update({
            "status": "failed_permanent",
            "last_error": message,
            "next_retry_at": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", capture_id).execute()
        client.table("capture_jobs").update({
            "status": "dead",
            "last_error": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("capture_id", capture_id).execute()
        return

    delay = min(BASE_RETRY_SECONDS * (2 ** max(attempt - 1, 0)), 15 * 60)
    run_after = datetime.now(timezone.utc) + timedelta(seconds=delay)
    client.table("capture_events").update({
        "status": "failed_retryable",
        "last_error": message,
        "next_retry_at": run_after.isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", capture_id).execute()
    client.table("capture_jobs").update({
        "status": "retry",
        "run_after": run_after.isoformat(),
        "locked_at": None,
        "locked_by": None,
        "last_error": message,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("capture_id", capture_id).execute()


def process_one() -> bool:
    """Claim and process one queued capture. Returns False when queue is empty."""
    client = get_client()
    claim = client.rpc("claim_capture_job", {"p_worker_id": _worker_id()}).execute()
    rows = claim.data or []
    if not rows:
        return False

    job = rows[0]
    capture_id = job["capture_id"]
    attempt = int(job["attempts"])

    capture_result = (
        client.table("capture_events")
        .select("*")
        .eq("id", capture_id)
        .limit(1)
        .execute()
    )
    if not capture_result.data:
        logger.error("Claimed capture %s no longer exists", capture_id)
        return True

    capture = capture_result.data[0]
    if capture.get("status") == "completed":
        client.table("capture_jobs").update({"status": "completed"}).eq("capture_id", capture_id).execute()
        return True

    text = (capture.get("raw_ocr_text") or "").strip()
    if not text:
        error = ValueError("capture has no OCR text")
        _record_extraction(
            capture_id,
            attempt,
            success=False,
            model=None,
            input_chars=0,
            error_type=type(error).__name__,
            error_message=str(error),
        )
        _schedule_failure(capture_id, MAX_ATTEMPTS, error)
        return True

    model = os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
    started = perf_counter()

    try:
        extraction = extract_intent_from_metadata(
            text,
            capture.get("entities") or {},
            capture.get("source"),
            capture.get("ocr_blocks") or [],
        )
        latency_ms = int((perf_counter() - started) * 1000)
        normalized = extraction.model_dump()

        _record_extraction(
            capture_id,
            attempt,
            success=True,
            model=model,
            normalized_result=normalized,
            latency_ms=latency_ms,
            input_chars=len(text),
        )

        items = [item.model_dump() for item in extraction.items]
        if not items:
            raise ValueError("classifier returned no items")

        result = client.rpc(
            "finalize_capture_event",
            {
                "p_capture_id": capture_id,
                "p_intent": extraction.intent,
                "p_category": extraction.category,
                "p_summary": extraction.summary,
                "p_extracted_text": extraction.extracted_text or text,
                "p_items": items,
            },
        ).execute()

        logger.info(
            "Capture %s completed with %d memories",
            capture_id,
            len(result.data or []),
        )
    except Exception as exc:
        latency_ms = int((perf_counter() - started) * 1000)
        logger.exception("Capture %s failed on attempt %s", capture_id, attempt)
        try:
            _record_extraction(
                capture_id,
                attempt,
                success=False,
                model=model,
                latency_ms=latency_ms,
                input_chars=len(text),
                error_type=type(exc).__name__,
                error_message=str(exc)[:1000],
            )
        except Exception:
            logger.exception("Failed to record extraction failure for %s", capture_id)
        _schedule_failure(capture_id, attempt, exc)

    return True


def run_forever() -> None:
    poll_seconds = float(os.environ.get("CAPTURE_WORKER_POLL_SECONDS", "1.5"))
    logger.info("Samhaal capture worker started as %s", _worker_id())
    while True:
        try:
            worked = process_one()
            if not worked:
                time.sleep(poll_seconds)
        except KeyboardInterrupt:
            raise
        except Exception:
            logger.exception("Capture worker loop failed")
            time.sleep(min(poll_seconds * 2, 10))
