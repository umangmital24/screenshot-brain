-- Model-free hybrid retrieval for Ask Samhaal.
-- Combines PostgreSQL full-text search with trigram fuzziness and keeps user isolation server-side.

create extension if not exists pg_trgm with schema extensions;

alter table public.memories
  add column if not exists search_text text
  generated always as (
    lower(
      coalesce(item_name, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(extracted_text, '') || ' ' ||
      coalesce(visual_context, '')
    )
  ) stored;

create index if not exists idx_memories_search_text_trgm
  on public.memories using gin(search_text extensions.gin_trgm_ops);

create or replace function public.search_memories_hybrid(
  p_user_id uuid,
  p_query text,
  p_limit integer default 100
)
returns setof public.memories
language sql
stable
set search_path = public
as $$
  with params as (
    select
      trim(lower(p_query)) as q,
      websearch_to_tsquery('simple'::regconfig, p_query) as tsq
  )
  select m.*
  from public.memories m
  cross join params p
  where m.user_id = p_user_id
    and p.q <> ''
    and (
      m.search_document @@ p.tsq
      or m.search_text OPERATOR(extensions.%) p.q
      or m.search_text like ('%' || p.q || '%')
    )
  order by
    (
      0.72 * ts_rank_cd(m.search_document, p.tsq)
      + 0.28 * extensions.similarity(m.search_text, p.q)
    ) desc,
    m.last_seen desc
  limit least(greatest(p_limit, 1), 250);
$$;

revoke execute on function public.search_memories_hybrid(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_memories_hybrid(uuid, text, integer) to service_role;
