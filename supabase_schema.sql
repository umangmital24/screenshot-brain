-- Canonical Samhaal Supabase schema
-- This reflects the hardened provider-neutral capture + subscription architecture.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Legacy-compatible screenshot/media records
-- ---------------------------------------------------------------------------
create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  image_url text,
  source text,
  client_event_id uuid,
  captured_at timestamptz,
  processing_status text not null default 'ready'
    check (processing_status in ('processing','ready','failed')),
  processing_error text,
  created_at timestamptz default now()
);

create unique index if not exists idx_screenshots_user_client_event
  on public.screenshots(user_id, client_event_id)
  where client_event_id is not null;
create index if not exists idx_screenshots_user_captured_at
  on public.screenshots(user_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Canonical user memories
-- ---------------------------------------------------------------------------
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid references public.screenshots(id) on delete cascade,
  user_id uuid not null,
  intent text not null,
  category text,
  item_name text not null,
  item_type text,
  summary text,
  extracted_text text,
  is_done boolean default false,
  frequency integer default 1,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_memories_item_name_trgm
  on public.memories using gin (item_name extensions.gin_trgm_ops);
create index if not exists idx_memories_user_intent
  on public.memories(user_id, intent);
create index if not exists idx_memories_user_done
  on public.memories(user_id, is_done);
create index if not exists idx_memories_screenshot_id
  on public.memories(screenshot_id);

create or replace function public.match_memory(
  p_user_id uuid,
  p_item_name text,
  p_intent text,
  p_threshold double precision
)
returns setof public.memories
language sql
stable
set search_path = public, extensions
as $$
  select *
  from public.memories
  where user_id = p_user_id
    and intent = p_intent
    and extensions.similarity(item_name, p_item_name) > p_threshold
  order by extensions.similarity(item_name, p_item_name) desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Provider-neutral subscription + entitlement model
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  code text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans(code, name) values
  ('free', 'Free'),
  ('pro', 'Pro')
on conflict (code) do nothing;

create table if not exists public.plan_entitlements (
  plan_code text not null references public.plans(code) on delete cascade,
  entitlement_key text not null,
  value_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_code, entitlement_key)
);

insert into public.plan_entitlements(plan_code, entitlement_key, value_json) values
  ('free', 'captures_per_month', '100'::jsonb),
  ('free', 'ask_queries_per_month', '100'::jsonb),
  ('free', 'retention_days', '365'::jsonb),
  ('pro', 'captures_per_month', '5000'::jsonb),
  ('pro', 'ask_queries_per_month', '5000'::jsonb),
  ('pro', 'retention_days', 'null'::jsonb)
on conflict (plan_code, entitlement_key) do nothing;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  plan_code text,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_user_subscriptions_plan
  on public.user_subscriptions(plan_code);
create index if not exists idx_user_subscriptions_provider_subscription
  on public.user_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  idempotency_key text,
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_usage_events_user_idempotency
  on public.usage_events(user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_usage_events_user_type_created
  on public.usage_events(user_id, event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Durable capture pipeline
-- ---------------------------------------------------------------------------
create table if not exists public.capture_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  capture_mode text not null default 'on_device_ocr'
    check (capture_mode in ('on_device_ocr','uploaded_image','shared_text')),
  source text,
  captured_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed_retryable','failed_permanent')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  raw_ocr_text text,
  ocr_blocks jsonb not null default '[]'::jsonb,
  entities jsonb not null default '{}'::jsonb,
  screenshot_id uuid references public.screenshots(id) on delete set null,
  result_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, client_event_id)
);

create index if not exists idx_capture_events_user_created
  on public.capture_events(user_id, created_at desc);
create index if not exists idx_capture_events_status_retry
  on public.capture_events(status, next_retry_at, created_at);
create index if not exists idx_capture_events_screenshot
  on public.capture_events(screenshot_id)
  where screenshot_id is not null;

create table if not exists public.capture_jobs (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null unique references public.capture_events(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','retry','dead')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capture_jobs_claim
  on public.capture_jobs(status, run_after, created_at);

create table if not exists public.capture_extractions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.capture_events(id) on delete cascade,
  attempt integer not null,
  provider text not null default 'google',
  model text,
  prompt_version text,
  schema_version text,
  normalized_result jsonb,
  latency_ms integer,
  input_chars integer,
  success boolean not null,
  error_type text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_capture_extractions_capture
  on public.capture_extractions(capture_id, created_at desc);

create table if not exists public.memory_occurrences (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  capture_id uuid not null references public.capture_events(id) on delete cascade,
  screenshot_id uuid references public.screenshots(id) on delete set null,
  source text,
  captured_at timestamptz,
  extracted_text text,
  created_at timestamptz not null default now(),
  unique(memory_id, capture_id)
);

create index if not exists idx_memory_occurrences_memory_created
  on public.memory_occurrences(memory_id, created_at desc);
create index if not exists idx_memory_occurrences_capture
  on public.memory_occurrences(capture_id);
create index if not exists idx_memory_occurrences_screenshot
  on public.memory_occurrences(screenshot_id)
  where screenshot_id is not null;

-- ---------------------------------------------------------------------------
-- Capture RPCs
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_capture_event(
  p_user_id uuid,
  p_client_event_id uuid,
  p_capture_mode text,
  p_source text,
  p_captured_at timestamptz,
  p_raw_ocr_text text,
  p_ocr_blocks jsonb,
  p_entities jsonb,
  p_screenshot_id uuid default null
)
returns public.capture_events
language plpgsql
set search_path = public, extensions
as $$
declare
  v_capture public.capture_events;
begin
  insert into public.capture_events (
    user_id, client_event_id, capture_mode, source, captured_at,
    raw_ocr_text, ocr_blocks, entities, screenshot_id, status
  ) values (
    p_user_id, p_client_event_id, p_capture_mode, p_source, p_captured_at,
    p_raw_ocr_text, coalesce(p_ocr_blocks, '[]'::jsonb),
    coalesce(p_entities, '{}'::jsonb), p_screenshot_id, 'queued'
  )
  on conflict (user_id, client_event_id) do update
    set updated_at = now()
  returning * into v_capture;

  insert into public.capture_jobs(capture_id, status, run_after)
  values (v_capture.id, 'queued', now())
  on conflict (capture_id) do nothing;

  return v_capture;
end;
$$;

create or replace function public.claim_capture_job(p_worker_id text)
returns table(job_id uuid, capture_id uuid, attempts integer)
language plpgsql
set search_path = public, extensions
as $$
declare
  v_job public.capture_jobs;
begin
  select * into v_job
  from public.capture_jobs
  where status in ('queued','retry')
    and run_after <= now()
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if not found then return; end if;

  update public.capture_jobs
  set status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  where id = v_job.id;

  update public.capture_events
  set status = 'processing',
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_job.capture_id;

  return query select v_job.id, v_job.capture_id, v_job.attempts + 1;
end;
$$;

create or replace function public.finalize_capture_event(
  p_capture_id uuid,
  p_intent text,
  p_category text,
  p_summary text,
  p_extracted_text text,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_capture public.capture_events;
  v_item jsonb;
  v_memory public.memories;
  v_results jsonb := '[]'::jsonb;
  v_name text;
  v_type text;
begin
  select * into v_capture
  from public.capture_events
  where id = p_capture_id
  for update;

  if not found then raise exception 'capture_not_found'; end if;

  if v_capture.status = 'completed' then
    select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      into v_results
    from public.memories m
    join public.memory_occurrences mo on mo.memory_id = m.id
    where mo.capture_id = p_capture_id;
    return v_results;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'capture_items_empty';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_name := nullif(trim(v_item->>'name'), '');
    v_type := nullif(trim(v_item->>'type'), '');
    if v_name is null then continue; end if;

    select * into v_memory
    from public.memories
    where user_id = v_capture.user_id
      and intent = p_intent
      and extensions.similarity(item_name, v_name) > 0.4
    order by extensions.similarity(item_name, v_name) desc
    limit 1
    for update;

    if found then
      update public.memories
      set frequency = coalesce(frequency, 1) + 1,
          last_seen = coalesce(v_capture.captured_at, now()),
          category = coalesce(p_category, category),
          summary = coalesce(p_summary, summary),
          extracted_text = coalesce(p_extracted_text, extracted_text),
          screenshot_id = coalesce(v_capture.screenshot_id, screenshot_id)
      where id = v_memory.id
      returning * into v_memory;
    else
      insert into public.memories (
        screenshot_id, user_id, intent, category, item_name, item_type,
        summary, extracted_text, frequency, last_seen
      ) values (
        v_capture.screenshot_id, v_capture.user_id, p_intent, p_category,
        v_name, v_type, p_summary, p_extracted_text, 1,
        coalesce(v_capture.captured_at, now())
      ) returning * into v_memory;
    end if;

    insert into public.memory_occurrences (
      memory_id, capture_id, screenshot_id, source, captured_at, extracted_text
    ) values (
      v_memory.id, v_capture.id, v_capture.screenshot_id, v_capture.source,
      v_capture.captured_at, p_extracted_text
    ) on conflict (memory_id, capture_id) do nothing;

    v_results := v_results || jsonb_build_array(to_jsonb(v_memory));
  end loop;

  update public.capture_events
  set status = 'completed', completed_at = now(), last_error = null, updated_at = now()
  where id = p_capture_id;

  update public.capture_jobs
  set status = 'completed', last_error = null, updated_at = now()
  where capture_id = p_capture_id;

  insert into public.usage_events(
    user_id, event_type, quantity, idempotency_key, reference_type, reference_id
  ) values (
    v_capture.user_id, 'capture_processed', 1,
    'capture:' || p_capture_id::text, 'capture', p_capture_id
  ) on conflict (user_id, idempotency_key) do nothing;

  return v_results;
end;
$$;

create or replace function public.get_user_entitlements(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with active_plan as (
    select coalesce(
      (select us.plan_code
       from public.user_subscriptions us
       where us.user_id = p_user_id
         and us.status in ('active','trialing')
       limit 1),
      'free'
    ) as plan_code
  )
  select jsonb_build_object(
    'plan_code', ap.plan_code,
    'entitlements', coalesce(
      jsonb_object_agg(pe.entitlement_key, pe.value_json)
        filter (where pe.entitlement_key is not null),
      '{}'::jsonb
    )
  )
  from active_plan ap
  left join public.plan_entitlements pe on pe.plan_code = ap.plan_code
  group by ap.plan_code;
$$;

-- ---------------------------------------------------------------------------
-- Landing-page waitlist
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  platform text default 'web',
  screenshot_habit text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Security posture: backend-only Data API surface.
-- FastAPI uses service_role; mobile/web clients use Supabase Auth only.
-- ---------------------------------------------------------------------------
alter table public.screenshots enable row level security;
alter table public.memories enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.waitlist enable row level security;
alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.usage_events enable row level security;
alter table public.capture_events enable row level security;
alter table public.capture_jobs enable row level security;
alter table public.capture_extractions enable row level security;
alter table public.memory_occurrences enable row level security;

revoke all on table public.screenshots from anon, authenticated;
revoke all on table public.memories from anon, authenticated;
revoke all on table public.user_subscriptions from anon, authenticated;
revoke all on table public.waitlist from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
revoke all on table public.plan_entitlements from anon, authenticated;
revoke all on table public.usage_events from anon, authenticated;
revoke all on table public.capture_events from anon, authenticated;
revoke all on table public.capture_jobs from anon, authenticated;
revoke all on table public.capture_extractions from anon, authenticated;
revoke all on table public.memory_occurrences from anon, authenticated;

grant select, insert, update, delete on table public.screenshots to service_role;
grant select, insert, update, delete on table public.memories to service_role;
grant select, insert, update, delete on table public.user_subscriptions to service_role;
grant select, insert, update, delete on table public.waitlist to service_role;
grant select, insert, update, delete on table public.plans to service_role;
grant select, insert, update, delete on table public.plan_entitlements to service_role;
grant select, insert, update, delete on table public.usage_events to service_role;
grant select, insert, update, delete on table public.capture_events to service_role;
grant select, insert, update, delete on table public.capture_jobs to service_role;
grant select, insert, update, delete on table public.capture_extractions to service_role;
grant select, insert, update, delete on table public.memory_occurrences to service_role;

revoke execute on function public.enqueue_capture_event(uuid, uuid, text, text, timestamptz, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.claim_capture_job(text) from public, anon, authenticated;
revoke execute on function public.finalize_capture_event(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.get_user_entitlements(uuid) from public, anon, authenticated;
revoke execute on function public.match_memory(uuid, text, text, double precision) from public, anon, authenticated;

grant execute on function public.enqueue_capture_event(uuid, uuid, text, text, timestamptz, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.claim_capture_job(text) to service_role;
grant execute on function public.finalize_capture_event(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.get_user_entitlements(uuid) to service_role;
grant execute on function public.match_memory(uuid, text, text, double precision) to service_role;

-- ---------------------------------------------------------------------------
-- Private screenshot storage bucket.
-- Raw Android Save Bubble screenshots are NOT uploaded here; the bucket exists
-- for explicit/manual image uploads only.
-- ---------------------------------------------------------------------------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
