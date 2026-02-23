-- Multi-board setup: boards table and RLS
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- After running, confirm to the developer before proceeding to Step 2.

-- Boards table (metadata for each whiteboard; Yjs state stays in yjs_updates keyed by room_id = board id)
create table if not exists boards (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Untitled Board',
  owner_id   text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table boards enable row level security;

-- Policy: authenticated users can insert a board (ownership stored in owner_id)
-- Note: With Supabase Auth, use auth.uid()::text. With Clerk + anon key, app enforces ownership in Server Actions; these policies apply when using Supabase Auth or custom JWT.
create policy "Users can insert own boards"
  on boards for insert
  to authenticated
  with check (true);

-- Policy: users can select only boards they own
create policy "Users can select own boards"
  on boards for select
  to authenticated
  using (owner_id = auth.uid()::text);

-- Policy: users can update only boards they own
create policy "Users can update own boards"
  on boards for update
  to authenticated
  using (owner_id = auth.uid()::text)
  with check (owner_id = auth.uid()::text);

-- Policy: users can delete only boards they own
create policy "Users can delete own boards"
  on boards for delete
  to authenticated
  using (owner_id = auth.uid()::text);

-- Allow anon key (used by Clerk + Server Actions pattern) full CRUD access.
-- Ownership is enforced in application code (Server Actions verify Clerk userId).
create policy "Anon read boards"
  on boards for select to anon using (true);
create policy "Anon insert boards"
  on boards for insert to anon with check (true);
create policy "Anon update boards"
  on boards for update to anon using (true) with check (true);
create policy "Anon delete boards"
  on boards for delete to anon using (true);
