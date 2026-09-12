-- Capture-side Gemini usage telemetry for quota/cost monitoring.

alter table public.capture_extractions
  add column if not exists prompt_tokens integer,
  add column if not exists candidate_tokens integer,
  add column if not exists thinking_tokens integer,
  add column if not exists total_tokens integer;

create index if not exists idx_capture_extractions_created_success
  on public.capture_extractions(created_at desc, success);
