-- Make finalize_capture_event's ON CONFLICT (user_id, idempotency_key)
-- target a real unique constraint. The existing partial unique index is not
-- sufficient for PostgreSQL's ON CONFLICT column inference.

alter table public.usage_events
  add constraint usage_events_user_id_idempotency_key_key
  unique (user_id, idempotency_key);
