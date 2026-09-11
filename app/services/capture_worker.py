from __future__ import annotations

import logging
import os
import socket
import threading
import time
from time import perf_counter

from supabase import create_client

from app.services.db import get_client
from app.services.vision import extract_intent_from_metadata

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v3-primary-target-geometry"
SCHEMA_VERSION = "capture-extraction-v1"
MAX_ATTEMPTS = int(os.environ.get("CAPTURE_MAX_ATTEMPTS", "5"))
BASE_RETRY_SECONDS = int(os.environ.get("CAPTURE_RETRY_BASE_SECONDS", "15"))
LEASE_SECONDS = max(int(os.environ.get("CAPTURE_WORKER_LEASE_SECONDS", "180")), 30)
HEARTBEAT_SECONDS = max(
    10,
    min(
        int(os.environ.get("CAPTURE_WORKER_HEARTBEAT_SECONDS", str(max(10, LEASE_SECONDS // 3)))),
        max(10, LEASE_SECONDS // 2),
    ),
)


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


def _heartbeat_loop(stop_event: threading.Event, job_id: str, worker_id: str) -> None:
    """Renew the DB lease while a capture is being processed.

    A dedicated Supabase client is used here so the heartbeat thread does not
    share request/session state with the main worker thread.
    """
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    while not stop_event.wait(HEARTBEAT_SECONDS):
        try:
            result = client.rpc(
                "renew_capture_job_lease",
                {
                    "p_job_id": job_id,
                    "p_worker_id": worker_id,
                    "p_lease_seconds": LEASE_SECONDS,
                },
            ).execute()
            renewed = result.data
            if isinstance(renewed, list):
                renewed = renewed[0] if renewed else False
            if not renewed:
                logger.warning(
                    "Worker %s no longer owns capture job %s; heartbeat stopped",
                    worker_id,
                    job_id,
                )
                return
        except Exception:
            # One transient heartbeat failure should not abort useful work. If
            # failures persist past lease expiry, another worker will recover it.
            logger.warning("Could not renew lease for job %s", job_id, exc_info=True)


def _schedule_failure(
    job_id: str,
    worker_id: str,
    attempt: int,
    error: Exception,
    *,
    permanent: bool = False,
) -> str:
    """Atomically transition an owned job to retry/dead.

    Ownership is checked in Postgres so a stale worker can never overwrite a
    job that another worker has already reclaimed.
    """
    client = get_client()
    result = client.rpc(
        "fail_capture_job",
        {
            "p_job_id": job_id,
            "p_worker_id": worker_id,
            "p_error": str(error)[:1000],
            "p_max_attempts": attempt if permanent else MAX_ATTEMPTS,
            "p_base_retry_seconds": BASE_RETRY_SECONDS,
        },
    ).execute()
    status = result.data
    if isinstance(status, list):
        status = status[0] if status else "unknown"
    return str(status or "unknown")


def process_one() -> bool:
    """Claim and process one queued capture. Returns False when queue is empty."""
    client = get_client()
    worker_id = _worker_id()
    claim = client.rpc(
        "claim_capture_job",
        {
            "p_worker_id": worker_id,
            "p_lease_seconds": LEASE_SECONDS,
        },
    ).execute()
    rows = claim.data or []
    if not rows:
        return False

    job = rows[0]
    job_id = job["job_id"]
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
        _schedule_failure(
            job_id,
            worker_id,
            attempt,
            ValueError("capture no longer exists"),
            permanent=True,
        )
        return True

    capture = capture_result.data[0]
    if capture.get("status") == "completed":
        # Normally finalize_capture_event has already closed the job. This is a
        # defensive path for a legacy/inconsistent row.
        _schedule_failure(
            job_id,
            worker_id,
            attempt,
            RuntimeError("capture already completed"),
        )
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
        _schedule_failure(job_id, worker_id, attempt, error, permanent=True)
        return True

    model = os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
    started = perf_counter()
    stop_heartbeat = threading.Event()
    heartbeat = threading.Thread(
        target=_heartbeat_loop,
        args=(stop_heartbeat, job_id, worker_id),
        name=f"capture-heartbeat-{job_id[:8]}",
        daemon=True,
    )
    heartbeat.start()

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
            "Capture %s completed with %d memories on attempt %d",
            capture_id,
            len(result.data or []),
            attempt,
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

        try:
            status = _schedule_failure(job_id, worker_id, attempt, exc)
            if status == "lost_lease":
                logger.warning(
                    "Capture %s failure ignored because worker %s lost the lease",
                    capture_id,
                    worker_id,
                )
        except Exception:
            # If failure bookkeeping itself fails, the lease will eventually
            # expire and another worker will recover this job automatically.
            logger.exception("Could not schedule retry for capture %s", capture_id)
    finally:
        stop_heartbeat.set()
        heartbeat.join(timeout=2)

    return True


def run_forever() -> None:
    poll_seconds = float(os.environ.get("CAPTURE_WORKER_POLL_SECONDS", "1.5"))
    logger.info(
        "Samhaal capture worker started as %s (lease=%ss heartbeat=%ss)",
        _worker_id(),
        LEASE_SECONDS,
        HEARTBEAT_SECONDS,
    )
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
