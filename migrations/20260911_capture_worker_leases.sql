-- Samhaal durable capture worker leases + stale-job recovery.
-- Prevents jobs from remaining stuck in `processing` after a worker crash and
-- makes failure transitions ownership-aware.

alter table public.capture_jobs
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_capture_jobs_lease_expiry
  on public.capture_jobs(lease_expires_at)
  where status = 'processing';

-- Replace the original claim function with a lease-aware version.
drop function if exists public.claim_capture_job(text);

create or replace function public.claim_capture_job(
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns table(job_id uuid, capture_id uuid, attempts integer)
language plpgsql
set search_path = public, extensions
as $$
declare
  v_job public.capture_jobs;
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 180), 30);
begin
  -- Requeue leases abandoned by workers that crashed or were terminated.
  with stale as (
    update public.capture_jobs
    set status = 'retry',
        run_after = now(),
        locked_at = null,
        locked_by = null,
        lease_expires_at = null,
        last_error = 'worker lease expired',
        updated_at = now()
    where status = 'processing'
      and lease_expires_at is not null
      and lease_expires_at <= now()
    returning capture_id
  )
  update public.capture_events ce
  set status = 'failed_retryable',
      next_retry_at = now(),
      last_error = 'worker lease expired',
      updated_at = now()
  where ce.id in (select capture_id from stale)
    and ce.status <> 'completed';

  select * into v_job
  from public.capture_jobs
  where status in ('queued','retry')
    and run_after <= now()
  order by run_after asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.capture_jobs
  set status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      last_error = null,
      updated_at = now()
  where id = v_job.id;

  update public.capture_events
  set status = 'processing',
      attempt_count = attempt_count + 1,
      next_retry_at = null,
      last_error = null,
      updated_at = now()
  where id = v_job.capture_id
    and status <> 'completed';

  return query
    select v_job.id, v_job.capture_id, v_job.attempts + 1;
end;
$$;

create or replace function public.renew_capture_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
set search_path = public, extensions
as $$
declare
  v_updated integer;
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 180), 30);
begin
  update public.capture_jobs
  set lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = p_worker_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.fail_capture_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_max_attempts integer default 5,
  p_base_retry_seconds integer default 15
)
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_job public.capture_jobs;
  v_capture public.capture_events;
  v_delay_seconds integer;
  v_run_after timestamptz;
begin
  select * into v_job
  from public.capture_jobs
  where id = p_job_id
  for update;

  if not found then
    return 'job_not_found';
  end if;

  -- A stale worker must never overwrite state belonging to a newer worker.
  if v_job.status <> 'processing' or v_job.locked_by is distinct from p_worker_id then
    return 'lost_lease';
  end if;

  select * into v_capture
  from public.capture_events
  where id = v_job.capture_id
  for update;

  if not found then
    update public.capture_jobs
    set status = 'dead',
        last_error = left(coalesce(p_error, 'capture not found'), 1000),
        locked_at = null,
        locked_by = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_job_id;
    return 'dead';
  end if;

  if v_capture.status = 'completed' then
    update public.capture_jobs
    set status = 'completed',
        last_error = null,
        locked_at = null,
        locked_by = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_job_id;
    return 'completed';
  end if;

  if v_job.attempts >= greatest(coalesce(p_max_attempts, 5), 1) then
    update public.capture_events
    set status = 'failed_permanent',
        last_error = left(coalesce(p_error, 'processing failed'), 1000),
        next_retry_at = null,
        updated_at = now()
    where id = v_job.capture_id;

    update public.capture_jobs
    set status = 'dead',
        last_error = left(coalesce(p_error, 'processing failed'), 1000),
        locked_at = null,
        locked_by = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_job_id;

    return 'failed_permanent';
  end if;

  v_delay_seconds := least(
    900,
    greatest(coalesce(p_base_retry_seconds, 15), 1)
      * power(2::numeric, greatest(v_job.attempts - 1, 0))::integer
  );
  v_run_after := now() + make_interval(secs => v_delay_seconds);

  update public.capture_events
  set status = 'failed_retryable',
      last_error = left(coalesce(p_error, 'processing failed'), 1000),
      next_retry_at = v_run_after,
      updated_at = now()
  where id = v_job.capture_id;

  update public.capture_jobs
  set status = 'retry',
      run_after = v_run_after,
      last_error = left(coalesce(p_error, 'processing failed'), 1000),
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_job_id;

  return 'retry';
end;
$$;

-- Finalization should release the lease atomically with completion.
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
  set status = 'completed',
      completed_at = now(),
      next_retry_at = null,
      last_error = null,
      updated_at = now()
  where id = p_capture_id;

  update public.capture_jobs
  set status = 'completed',
      last_error = null,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      updated_at = now()
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

revoke execute on function public.claim_capture_job(text, integer) from public, anon, authenticated;
revoke execute on function public.renew_capture_job_lease(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.fail_capture_job(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.finalize_capture_event(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_capture_job(text, integer) to service_role;
grant execute on function public.renew_capture_job_lease(uuid, text, integer) to service_role;
grant execute on function public.fail_capture_job(uuid, text, text, integer, integer) to service_role;
grant execute on function public.finalize_capture_event(uuid, text, text, text, text, jsonb) to service_role;
