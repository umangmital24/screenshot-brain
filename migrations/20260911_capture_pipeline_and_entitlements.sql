-- Samhaal capture pipeline + subscription/entitlement foundation
-- Run once in Supabase SQL Editor.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Provider-neutral subscription model
-- ---------------------------------------------------------------------------
create table if not exists plans (
  code text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into plans (code, name) values
  ('free', 'Free'),
  ('pro', 'Pro')
on conflict (code) do nothing;

create table if not exists plan_entitlements (
  plan_code text not null references plans(code) on delete cascade,
  entitlement_key text not null,
  value_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, entitlement_key)
);

-- Defaults are intentionally conservative and can be changed without app releases.
insert into plan_entitlements (plan_code, entitlement_key, value_json) values
  ('free', 'captures_per_month', '100'::jsonb),
  ('free', 'ask_queries_per_month', '100'::jsonb),
  ('free', 'retention_days', '365'::jsonb),
  ('pro', 'captures_per_month', '5000'::jsonb),
  ('pro', 'ask_queries_per_month', '5000'::jsonb),
  ('pro', 'retention_days', 'null'::jsonb)
on conflict (plan_code, entitlement_key) do nothing;

-- Generalize the existing user_subscriptions table instead of tying product logic
-- to Stripe. Legacy stripe_* columns may remain for backward compatibility.
create table if not exists user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  tier text not null default 'free',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_subscriptions add column if not exists plan_code text;
alter table user_subscriptions add column if not exists provider text;
alter table user_subscriptions add column if not exists provider_customer_id text;
alter table user_subscriptions add column if not exists provider_subscription_id text;
alter table user_subscriptions add column if not exists current_period_start timestamptz;
alter table user_subscriptions add column if not exists current_period_end timestamptz;
alter table user_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table user_subscriptions add column if not exists metadata jsonb not null default '{}'::jsonb;

update user_subscriptions
set plan_code = coalesce(plan_code, tier, 'free')
where plan_code is null;

create index if not exists idx_user_subscriptions_plan on user_subscriptions(plan_code);
create index if not exists idx_user_subscriptions_provider_subscription
  on user_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists usage_events (
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
  on usage_events(user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_usage_events_user_type_created
  on usage_events(user_id, event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Durable capture-event pipeline
-- ---------------------------------------------------------------------------
create table if not exists capture_events (
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
  screenshot_id uuid references screenshots(id) on delete set null,
  result_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, client_event_id)
);

create index if not exists idx_capture_events_user_created
  on capture_events(user_id, created_at desc);
create index if not exists idx_capture_events_status_retry
  on capture_events(status, next_retry_at, created_at);

create table if not exists capture_jobs (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null unique references capture_events(id) on delete cascade,
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
  on capture_jobs(status, run_after, created_at);

create table if not exists capture_extractions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references capture_events(id) on delete cascade,
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
  on capture_extractions(capture_id, created_at desc);

create table if not exists memory_occurrences (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references memories(id) on delete cascade,
  capture_id uuid not null references capture_events(id) on delete cascade,
  screenshot_id uuid references screenshots(id) on delete set null,
  source text,
  captured_at timestamptz,
  extracted_text text,
  created_at timestamptz not null default now(),
  unique(memory_id, capture_id)
);

create index if not exists idx_memory_occurrences_memory_created
  on memory_occurrences(memory_id, created_at desc);
create index if not exists idx_memory_occurrences_capture
  on memory_occurrences(capture_id);

-- ---------------------------------------------------------------------------
-- RPC: enqueue exactly once per user/client event
-- ---------------------------------------------------------------------------
create or replace function enqueue_capture_event(
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
returns capture_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capture capture_events;
begin
  insert into capture_events (
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

  insert into capture_jobs (capture_id, status, run_after)
  values (v_capture.id, 'queued', now())
  on conflict (capture_id) do nothing;

  return v_capture;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: atomically claim one due job. SKIP LOCKED makes multiple workers safe.
-- ---------------------------------------------------------------------------
create or replace function claim_capture_job(p_worker_id text)
returns table (
  job_id uuid,
  capture_id uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job capture_jobs;
begin
  select * into v_job
  from capture_jobs
  where status in ('queued','retry')
    and run_after <= now()
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update capture_jobs
  set status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  where id = v_job.id;

  update capture_events
  set status = 'processing',
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_job.capture_id;

  return query select v_job.id, v_job.capture_id, v_job.attempts + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: transactional finalization of one capture.
-- Dedupes against canonical memories while preserving every capture occurrence.
-- ---------------------------------------------------------------------------
create or replace function finalize_capture_event(
  p_capture_id uuid,
  p_intent text,
  p_category text,
  p_summary text,
  p_extracted_text text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capture capture_events;
  v_item jsonb;
  v_memory memories;
  v_results jsonb := '[]'::jsonb;
  v_name text;
  v_type text;
begin
  select * into v_capture
  from capture_events
  where id = p_capture_id
  for update;

  if not found then
    raise exception 'capture_not_found';
  end if;

  if v_capture.status = 'completed' then
    select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    into v_results
    from memories m
    join memory_occurrences mo on mo.memory_id = m.id
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
    if v_name is null then
      continue;
    end if;

    select * into v_memory
    from memories
    where user_id = v_capture.user_id
      and intent = p_intent
      and similarity(item_name, v_name) > 0.4
    order by similarity(item_name, v_name) desc
    limit 1
    for update;

    if found then
      update memories
      set frequency = coalesce(frequency, 1) + 1,
          last_seen = coalesce(v_capture.captured_at, now()),
          category = coalesce(p_category, category),
          summary = coalesce(p_summary, summary),
          extracted_text = coalesce(p_extracted_text, extracted_text),
          screenshot_id = coalesce(v_capture.screenshot_id, screenshot_id)
      where id = v_memory.id
      returning * into v_memory;
    else
      insert into memories (
        screenshot_id, user_id, intent, category, item_name, item_type,
        summary, extracted_text, frequency, last_seen
      ) values (
        v_capture.screenshot_id, v_capture.user_id, p_intent, p_category,
        v_name, v_type, p_summary, p_extracted_text, 1,
        coalesce(v_capture.captured_at, now())
      ) returning * into v_memory;
    end if;

    insert into memory_occurrences (
      memory_id, capture_id, screenshot_id, source, captured_at, extracted_text
    ) values (
      v_memory.id, v_capture.id, v_capture.screenshot_id, v_capture.source,
      v_capture.captured_at, p_extracted_text
    ) on conflict (memory_id, capture_id) do nothing;

    v_results := v_results || jsonb_build_array(to_jsonb(v_memory));
  end loop;

  update capture_events
  set status = 'completed',
      completed_at = now(),
      last_error = null,
      updated_at = now()
  where id = p_capture_id;

  update capture_jobs
  set status = 'completed',
      last_error = null,
      updated_at = now()
  where capture_id = p_capture_id;

  insert into usage_events (
    user_id, event_type, quantity, idempotency_key, reference_type, reference_id
  ) values (
    v_capture.user_id, 'capture_processed', 1,
    'capture:' || p_capture_id::text, 'capture', p_capture_id
  ) on conflict (user_id, idempotency_key) do nothing;

  return v_results;
end;
$$;

-- Provider-neutral helper for the app/API. If no row exists, user is Free.
create or replace function get_user_entitlements(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active_plan as (
    select coalesce(
      (select us.plan_code
       from user_subscriptions us
       where us.user_id = p_user_id
         and us.status in ('active','trialing')
       limit 1),
      'free'
    ) as plan_code
  )
  select jsonb_build_object(
    'plan_code', ap.plan_code,
    'entitlements', coalesce(jsonb_object_agg(pe.entitlement_key, pe.value_json), '{}'::jsonb)
  )
  from active_plan ap
  left join plan_entitlements pe on pe.plan_code = ap.plan_code
  group by ap.plan_code;
$$;
