#!/usr/bin/env bash
set -euo pipefail

python capture_worker.py &
WORKER_PID=$!

uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" &
WEB_PID=$!

cleanup() {
  kill "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
  wait "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# If either process exits, stop the other so Render can restart the service cleanly.
set +e
wait -n "$WORKER_PID" "$WEB_PID"
STATUS=$?
set -e

exit "$STATUS"
