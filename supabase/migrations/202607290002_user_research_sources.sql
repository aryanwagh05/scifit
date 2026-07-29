create table if not exists public.user_research_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  title text not null,
  abstract_text text not null,
  source_name text,
  journal text,
  year text,
  published_at text,
  authors text,
  url text,
  doi text,
  pmid text,
  tags text[] not null default '{}',
  imported_at timestamptz not null default now(),
  primary key (user_id, external_id)
);

create index if not exists user_research_sources_user_imported_idx
  on public.user_research_sources (user_id, imported_at desc);

create index if not exists user_research_sources_tags_idx
  on public.user_research_sources using gin (tags);

alter table public.user_research_sources enable row level security;

drop policy if exists "Users can read own research sources" on public.user_research_sources;
drop policy if exists "Users can insert own research sources" on public.user_research_sources;
drop policy if exists "Users can update own research sources" on public.user_research_sources;
drop policy if exists "Users can delete own research sources" on public.user_research_sources;

create policy "Users can read own research sources" on public.user_research_sources
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own research sources" on public.user_research_sources
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own research sources" on public.user_research_sources
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own research sources" on public.user_research_sources
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_research_sources to authenticated;
