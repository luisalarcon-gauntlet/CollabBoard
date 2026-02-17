-- CollabBoard: Yjs persistence table
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

create table if not exists yjs_updates (
  id        bigserial     primary key,
  room_id   text          not null unique,
  content   bytea,
  created_at timestamptz  not null default now()
);

-- Enable Realtime on the table so y-supabase can sync via broadcast + postgres changes
alter publication supabase_realtime add table yjs_updates;

-- Row Level Security: allow authenticated users to read and write
alter table yjs_updates enable row level security;

create policy "Allow authenticated read"
  on yjs_updates for select
  to authenticated
  using (true);

create policy "Allow authenticated insert"
  on yjs_updates for insert
  to authenticated
  with check (true);

create policy "Allow authenticated update"
  on yjs_updates for update
  to authenticated
  using (true)
  with check (true);

-- Allow anon key (used by client SDK) the same access
create policy "Allow anon read"
  on yjs_updates for select
  to anon
  using (true);

create policy "Allow anon insert"
  on yjs_updates for insert
  to anon
  with check (true);

create policy "Allow anon update"
  on yjs_updates for update
  to anon
  using (true)
  with check (true);
