-- Retrieval-first Ask Samhaal.
-- Adds a server-side full-text index without changing the existing memories API.

alter table public.memories
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(item_name, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(extracted_text, '') || ' ' ||
      coalesce(visual_context, '')
    )
  ) stored;

create index if not exists idx_memories_search_document
  on public.memories using gin(search_document);

create index if not exists idx_memories_user_last_seen
  on public.memories(user_id, last_seen desc);

create or replace function public.search_memories_fts(
  p_user_id uuid,
  p_query text,
  p_limit integer default 100
)
returns setof public.memories
language sql
stable
set search_path = public
as $$
  select m.*
  from public.memories m
  where m.user_id = p_user_id
    and nullif(trim(p_query), '') is not null
    and m.search_document @@ websearch_to_tsquery('simple'::regconfig, p_query)
  order by
    ts_rank_cd(m.search_document, websearch_to_tsquery('simple'::regconfig, p_query)) desc,
    m.last_seen desc
  limit least(greatest(p_limit, 1), 250);
$$;

revoke execute on function public.search_memories_fts(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_memories_fts(uuid, text, integer) to service_role;
