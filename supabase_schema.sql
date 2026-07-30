-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)

create extension if not exists pg_trgm;
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
  frequency int default 1,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Trigram index for fuzzy duplicate matching on item_name
create index if not exists idx_memories_item_name_trgm
  on memories using gin (item_name gin_trgm_ops);

create index if not exists idx_memories_user_intent
  on memories (user_id, intent);

-- Storage bucket (create via Supabase Dashboard > Storage > New Bucket)
-- Name: screenshots
-- Public: true (simplest for MVP; switch to signed URLs later if needed)
