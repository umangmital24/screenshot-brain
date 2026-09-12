-- Samhaal Supabase hardening + cleanup
-- Mirrors the production cleanup applied to the active Supabase project.

-- ---------------------------------------------------------------------------
-- Provider-neutral subscription state is server-managed only.
-- ---------------------------------------------------------------------------
alter table public.user_subscriptions enable row level security;
revoke all on table public.user_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.user_subscriptions to service_role;

alter table public.user_subscriptions
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id,
  drop column if exists tier,
  drop column if exists monthly_upload_count,
  drop column if exists quota_reset_at;

-- ---------------------------------------------------------------------------
-- Application data is served through FastAPI. Supabase Auth remains client-side,
-- but application tables are not directly exposed to anon/authenticated clients.
-- ---------------------------------------------------------------------------
alter table public.screenshots enable row level security;
alter table public.memories enable row level security;
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
revoke all on table public.waitlist from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
revoke all on table public.plan_entitlements from anon, authenticated;
revoke all on table public.usage_events from anon, authenticated;
revoke all on table public.capture_events from anon, authenticated;
revoke all on table public.capture_jobs from anon, authenticated;
revoke all on table public.capture_extractions from anon, authenticated;
revoke all on table public.memory_occurrences from anon, authenticated;

-- Old direct-client RLS policies are no longer part of the supported surface.
drop policy if exists "Users manage their own screenshots" on public.screenshots;
drop policy if exists "Users manage their own memories" on public.memories;

-- ---------------------------------------------------------------------------
-- Dedupe cleanup and pg_trgm hardening.
-- ---------------------------------------------------------------------------
drop function if exists public.match_memory(uuid, text, double precision);

create schema if not exists extensions;

-- If pg_trgm was created in public, move it to the non-exposed extensions schema.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm' and n.nspname <> 'extensions'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end $$;

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

alter function public.finalize_capture_event(uuid, text, text, text, text, jsonb)
  set search_path = public, extensions;
alter function public.enqueue_capture_event(uuid, uuid, text, text, timestamptz, text, jsonb, jsonb, uuid)
  set search_path = public, extensions;
alter function public.claim_capture_job(text)
  set search_path = public, extensions;
alter function public.get_user_entitlements(uuid)
  set search_path = public, extensions;

-- Privileged RPCs are backend-only.
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
-- Index cleanup / missing FK coverage.
-- ---------------------------------------------------------------------------
drop index if exists public.idx_waitlist_email;
drop index if exists public.idx_user_subscriptions_user;
create index if not exists idx_memories_screenshot_id on public.memories(screenshot_id);

-- ---------------------------------------------------------------------------
-- Storage stays private and server-managed. Android privacy flow does not upload
-- raw screenshots; this bucket exists only for explicit/manual image uploads.
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'screenshots';

drop policy if exists "Users can delete their own screenshots" on storage.objects;
drop policy if exists "Users can upload to their own folder" on storage.objects;
drop policy if exists "Users can view their own screenshots" on storage.objects;

-- uuid-ossp is no longer required; gen_random_uuid() is used throughout.
drop extension if exists "uuid-ossp";
