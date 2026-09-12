create extension if not exists vector with schema extensions;

alter table public.memories
    add column if not exists embedding extensions.vector(384),
    add column if not exists embedding_model text;

create index if not exists memories_embedding_hnsw_idx
    on public.memories
    using hnsw (embedding extensions.vector_cosine_ops)
    where embedding is not null;

create or replace function public.search_memories_vector(
    p_user_id uuid,
    p_query_embedding extensions.vector(384),
    p_limit integer default 80
)
returns table (
    id uuid,
    screenshot_id uuid,
    intent text,
    category text,
    item_name text,
    summary text,
    extracted_text text,
    visual_context text,
    frequency integer,
    last_seen timestamptz,
    vector_similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
    select
        m.id,
        m.screenshot_id,
        m.intent,
        m.category,
        m.item_name,
        m.summary,
        m.extracted_text,
        m.visual_context,
        m.frequency,
        m.last_seen,
        (1 - (m.embedding <=> p_query_embedding))::double precision as vector_similarity
    from public.memories m
    where m.user_id = p_user_id
      and m.embedding is not null
    order by m.embedding <=> p_query_embedding
    limit greatest(1, least(coalesce(p_limit, 80), 250));
$$;

revoke all on function public.search_memories_vector(uuid, extensions.vector, integer) from public;
grant execute on function public.search_memories_vector(uuid, extensions.vector, integer) to service_role;
