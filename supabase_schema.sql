-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)

create extension if not exists pg_trgm;
create extension if not exists vector with schema extensions;
create extension if not exists "uuid-ossp";

create table if not exists screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  image_url text not null,
  source text,
  created_at timestamptz default now()
);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid references screenshots(id) on delete cascade,
  user_id uuid not null,
  intent text not null,
  category text,
  item_name text not null,
  item_type text,
  summary text,
  extracted_text text,
  embedding extensions.vector(768),
  is_done boolean default false,
  frequency int default 1,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Migrations for existing databases
alter table memories add column if not exists extracted_text text;
alter table memories add column if not exists is_done boolean default false;
alter table memories add column if not exists embedding extensions.vector(768);

create index if not exists idx_memories_item_name_trgm
  on memories using gin (item_name gin_trgm_ops);
create index if not exists idx_memories_user_intent on memories (user_id, intent);
create index if not exists idx_memories_user_done on memories (user_id, is_done);
create index if not exists idx_memories_embedding_hnsw
  on memories using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Stage 1 duplicate matching: cheap trigram gate.
create or replace function match_memory(p_user_id uuid, p_item_name text, p_intent text, p_threshold float)
returns setof memories as $$
  select * from memories
  where user_id = p_user_id
    and intent = p_intent
    and similarity(item_name, p_item_name) > p_threshold
  order by similarity(item_name, p_item_name) desc
  limit 1;
$$ language sql stable;

-- Stage 2 duplicate matching: semantic equivalence after the trigram gate misses.
create or replace function match_memory_semantic(
  p_user_id uuid,
  p_intent text,
  p_embedding extensions.vector(768),
  p_threshold float default 0.90
)
returns setof memories
language sql stable
as $$
  select m.*
  from memories m
  where m.user_id = p_user_id
    and m.intent = p_intent
    and m.embedding is not null
    and (1.0 - (m.embedding <=> p_embedding)) >= p_threshold
  order by m.embedding <=> p_embedding
  limit 1;
$$;

-- Hybrid retrieval: semantic candidates + lexical candidates, followed by a
-- deterministic ranker. Weights are explicit so they can be tuned against the
-- offline Recall@K/MRR/NDCG evaluation set.
create or replace function hybrid_search_memories(
  p_user_id uuid,
  p_query text,
  p_query_embedding extensions.vector(768),
  p_match_count int default 8,
  p_candidate_count int default 32
)
returns table (
  id uuid,
  screenshot_id uuid,
  user_id uuid,
  intent text,
  category text,
  item_name text,
  item_type text,
  summary text,
  extracted_text text,
  is_done boolean,
  frequency int,
  last_seen timestamptz,
  created_at timestamptz,
  semantic_score double precision,
  lexical_score double precision,
  recency_score double precision,
  frequency_score double precision,
  retrieval_score double precision
)
language sql stable
as $$
  with semantic_candidates as (
    select m.id
    from memories m
    where m.user_id = p_user_id and m.embedding is not null
    order by m.embedding <=> p_query_embedding
    limit greatest(p_candidate_count, p_match_count)
  ),
  lexical_candidates as (
    select m.id
    from memories m
    where m.user_id = p_user_id
    order by greatest(
      similarity(lower(m.item_name), lower(p_query)),
      similarity(lower(coalesce(m.extracted_text, '')), lower(p_query)),
      similarity(lower(coalesce(m.summary, '')), lower(p_query))
    ) desc
    limit greatest(p_candidate_count, p_match_count)
  ),
  candidates as (
    select id from semantic_candidates
    union
    select id from lexical_candidates
  ),
  scored as (
    select
      m.*,
      case when m.embedding is null then 0.0
           else greatest(0.0, 1.0 - (m.embedding <=> p_query_embedding)) end as s_semantic,
      greatest(
        similarity(lower(m.item_name), lower(p_query)),
        similarity(lower(coalesce(m.extracted_text, '')), lower(p_query)),
        similarity(lower(coalesce(m.summary, '')), lower(p_query))
      )::double precision as s_lexical,
      exp(-greatest(extract(epoch from (now() - coalesce(m.last_seen, m.created_at))) / 86400.0, 0.0) / 90.0)::double precision as s_recency,
      least(ln(1.0 + greatest(coalesce(m.frequency, 1), 1)) / ln(11.0), 1.0)::double precision as s_frequency
    from memories m
    join candidates c on c.id = m.id
    where m.user_id = p_user_id
  )
  select
    s.id, s.screenshot_id, s.user_id, s.intent, s.category, s.item_name,
    s.item_type, s.summary, s.extracted_text, s.is_done, s.frequency,
    s.last_seen, s.created_at,
    s.s_semantic as semantic_score,
    s.s_lexical as lexical_score,
    s.s_recency as recency_score,
    s.s_frequency as frequency_score,
    (0.60 * s.s_semantic + 0.25 * s.s_lexical + 0.10 * s.s_recency + 0.05 * s.s_frequency)::double precision as retrieval_score
  from scored s
  order by retrieval_score desc
  limit greatest(1, least(p_match_count, 20));
$$;

-- User Subscriptions & Quotas Table (Stripe & RevenueCat)
create table if not exists user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free', -- 'free' | 'pro' | 'lifetime'
  status text not null default 'active', -- 'active' | 'canceled' | 'past_due'
  monthly_upload_count int default 0,
  quota_reset_at timestamptz default (now() + interval '1 month'),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_subscriptions_user on user_subscriptions (user_id);
create index if not exists idx_user_subscriptions_stripe_customer on user_subscriptions (stripe_customer_id);

-- Storage bucket (create via Supabase Dashboard > Storage > New Bucket)
-- Name: screenshots
-- Public: false (private bucket with 1-hour signed URL generation)
