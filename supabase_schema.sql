-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)

create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

create table if not exists screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  image_url text,
  source text,
  processing_status text not null default 'ready',
  processing_error text,
  created_at timestamptz default now(),
  constraint screenshots_processing_status_check check (processing_status in ('processing','ready','failed'))
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
  is_done boolean default false,
  frequency int default 1,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

alter table screenshots alter column image_url drop not null;
alter table screenshots add column if not exists processing_status text not null default 'ready';
alter table screenshots add column if not exists processing_error text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'screenshots_processing_status_check'
  ) THEN
    ALTER TABLE screenshots ADD CONSTRAINT screenshots_processing_status_check
      CHECK (processing_status in ('processing','ready','failed'));
  END IF;
END $$;
alter table memories add column if not exists extracted_text text;
alter table memories add column if not exists is_done boolean default false;

create index if not exists idx_memories_item_name_trgm
  on memories using gin (item_name gin_trgm_ops);
create index if not exists idx_memories_user_intent on memories (user_id, intent);
create index if not exists idx_memories_user_done on memories (user_id, is_done);

create or replace function match_memory(p_user_id uuid, p_item_name text, p_intent text, p_threshold float)
returns setof memories as $$
  select * from memories
  where user_id = p_user_id
    and intent = p_intent
    and similarity(item_name, p_item_name) > p_threshold
  order by similarity(item_name, p_item_name) desc
  limit 1;
$$ language sql stable;

create table if not exists user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free',
  status text not null default 'active',
  monthly_upload_count int default 0,
  quota_reset_at timestamptz default (now() + interval '1 month'),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_subscriptions_user on user_subscriptions (user_id);
create index if not exists idx_user_subscriptions_stripe_customer on user_subscriptions (stripe_customer_id);

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  platform text default 'web',
  screenshot_habit text,
  created_at timestamptz default now()
);

alter table waitlist add column if not exists screenshot_habit text;
create unique index if not exists idx_waitlist_email on waitlist (email);

-- Storage bucket (create via Supabase Dashboard > Storage > New Bucket)
-- Name: screenshots
-- Public: false
