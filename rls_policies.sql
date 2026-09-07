alter table screenshots enable row level security;
alter table memories enable row level security;
alter table user_subscriptions enable row level security;
alter table waitlist enable row level security;

drop policy if exists "Users manage their own screenshots" on screenshots;
create policy "Users manage their own screenshots"
  on screenshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own memories" on memories;
create policy "Users manage their own memories"
  on memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read their own subscription" on user_subscriptions;
create policy "Users read their own subscription"
  on user_subscriptions for select
  using (auth.uid() = user_id);

-- Waitlist reads/writes are server-only through the Supabase service-role client.
-- No anon/authenticated client policy is intentionally created.

drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view their own screenshots" on storage.objects;
create policy "Users can view their own screenshots"
  on storage.objects for select
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own screenshots" on storage.objects;
create policy "Users can delete their own screenshots"
  on storage.objects for delete
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
