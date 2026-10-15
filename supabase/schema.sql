-- Bitácora de Combustible: one table holds every record (trucks, daily entries, month totals, quarter odometers).
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.docs (
  collection text not null,              -- 'trucks' | 'entries' | 'months' | 'quarters'
  id         text not null,              -- e.g. '2021_2026-08-15'
  truck      text,                       -- truck id, used to load one truck at a time
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);

create index if not exists docs_collection_truck on public.docs (collection, truck);

-- Only signed-in users (the people you create in Authentication → Users) can read or change data.
alter table public.docs enable row level security;

drop policy if exists "signed in can read"   on public.docs;
drop policy if exists "signed in can insert" on public.docs;
drop policy if exists "signed in can update" on public.docs;
drop policy if exists "signed in can delete" on public.docs;

create policy "signed in can read"   on public.docs for select to authenticated using (true);
create policy "signed in can insert" on public.docs for insert to authenticated with check (true);
create policy "signed in can update" on public.docs for update to authenticated using (true) with check (true);
create policy "signed in can delete" on public.docs for delete to authenticated using (true);

-- keep updated_at / updated_by current on every write
create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- live updates: when the driver saves a day, your open screen refreshes
alter table public.docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
