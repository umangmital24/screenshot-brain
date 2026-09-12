-- Fix PL/pgSQL output-column ambiguity in claim_capture_job.
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
  with stale_jobs as (
    update public.capture_jobs j
    set status = 'retry',
        run_after = now(),
        locked_at = null,
        locked_by = null,
        lease_expires_at = null,
        last_error = 'worker lease expired',
        updated_at = now()
    where j.status = 'processing'
      and j.lease_expires_at is not null
      and j.lease_expires_at <= now()
    returning j.capture_id as stale_capture_id
  )
  update public.capture_events ce
  set status = 'failed_retryable',
      next_retry_at = now(),
      last_error = 'worker lease expired',
      updated_at = now()
  where ce.id in (select sj.stale_capture_id from stale_jobs sj)
    and ce.status <> 'completed';

  select j.* into v_job
  from public.capture_jobs j
  where j.status in ('queued','retry')
    and j.run_after <= now()
  order by j.run_after asc, j.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.capture_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      last_error = null,
      updated_at = now()
  where j.id = v_job.id;

  update public.capture_events ce
  set status = 'processing',
      attempt_count = ce.attempt_count + 1,
      next_retry_at = null,
      last_error = null,
      updated_at = now()
  where ce.id = v_job.capture_id
    and ce.status <> 'completed';

  return query
    select v_job.id, v_job.capture_id, v_job.attempts + 1;
end;
$$;

revoke execute on function public.claim_capture_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_capture_job(text, integer) to service_role;
