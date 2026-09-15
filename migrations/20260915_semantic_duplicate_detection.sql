-- Samhaal DS: stage-2 semantic duplicate detection.
-- The production embedding model is BAAI/bge-small-en-v1.5 (384 dimensions).

create extension if not exists vector with schema extensions;

drop function if exists public.hybrid_search_memories(uuid, text, extensions.vector, integer, integer);

create or replace function public.match_memory_semantic(
  p_user_id uuid,
  p_intent text,
  p_embedding extensions.vector(384),
  p_threshold double precision default 0.90
)
returns setof public.memories
language sql
stable
security definer
set search_path = public, extensions
as $$
  select m.*
  from public.memories m
  where m.user_id = p_user_id
    and m.intent = p_intent
    and m.embedding is not null
    and (1.0 - (m.embedding <=> p_embedding)) >= p_threshold
  order by m.embedding <=> p_embedding
  limit 1;
$$;

revoke all on function public.match_memory_semantic(uuid, text, extensions.vector, double precision)
  from public, anon, authenticated;
grant execute on function public.match_memory_semantic(uuid, text, extensions.vector, double precision)
  to service_role;
