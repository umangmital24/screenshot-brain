-- Enable Row Level Security on both tables
alter table screenshots enable row level security;
alter table memories enable row level security;

-- Users can only see/modify their own screenshots
create policy "Users manage their own screenshots"
  on screenshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can only see/modify their own memories
create policy "Users manage their own memories"
  on memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- Storage bucket lockdown ----------
-- Run this in the Supabase dashboard too: Storage -> screenshots bucket -> Edit bucket
-- -> toggle "Public bucket" OFF (screenshots are stored at path "{user_id}/{filename}",
-- so these policies restrict access to files under a user's own folder)

create policy "Users can upload to their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own screenshots"
  on storage.objects for select
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own screenshots"
  on storage.objects for delete
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
