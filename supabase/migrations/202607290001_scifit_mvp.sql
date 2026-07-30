create extension if not exists vector with schema extensions;

set search_path = public, extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Athlete',
  goal text not null default 'Hypertrophy',
  experience text not null default 'Intermediate',
  diet_style text not null default 'Balanced',
  training_days integer not null default 4 check (training_days between 1 and 7),
  height_cm numeric not null default 175,
  weight_kg numeric not null default 75,
  sleep_hours numeric not null default 7,
  soreness numeric not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  muscle text not null,
  sets integer not null check (sets > 0),
  reps integer not null check (reps > 0),
  load numeric not null default 0,
  rpe numeric not null default 7 check (rpe between 1 and 10),
  created_at timestamptz not null default now()
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal text not null,
  calories integer not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_kind text not null check (file_kind in ('image', 'video')),
  storage_path text not null,
  note text,
  model_status text not null default 'queued',
  model_result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  content text not null,
  embedding vector(384),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists workout_sets_user_created_idx on public.workout_sets (user_id, created_at desc);
create index if not exists nutrition_logs_user_created_idx on public.nutrition_logs (user_id, created_at desc);
create index if not exists ai_uploads_user_created_idx on public.ai_uploads (user_id, created_at desc);
create index if not exists rag_chunks_embedding_idx on public.rag_chunks using hnsw (embedding vector_cosine_ops);

alter table public.profiles enable row level security;
alter table public.workout_sets enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.ai_uploads enable row level security;
alter table public.rag_documents enable row level security;
alter table public.rag_chunks enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can read own workout sets" on public.workout_sets;
drop policy if exists "Users can insert own workout sets" on public.workout_sets;
drop policy if exists "Users can update own workout sets" on public.workout_sets;
drop policy if exists "Users can delete own workout sets" on public.workout_sets;
create policy "Users can read own workout sets" on public.workout_sets for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own workout sets" on public.workout_sets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own workout sets" on public.workout_sets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete own workout sets" on public.workout_sets for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own nutrition logs" on public.nutrition_logs;
drop policy if exists "Users can insert own nutrition logs" on public.nutrition_logs;
drop policy if exists "Users can update own nutrition logs" on public.nutrition_logs;
drop policy if exists "Users can delete own nutrition logs" on public.nutrition_logs;
create policy "Users can read own nutrition logs" on public.nutrition_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own nutrition logs" on public.nutrition_logs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own nutrition logs" on public.nutrition_logs for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete own nutrition logs" on public.nutrition_logs for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own ai uploads" on public.ai_uploads;
drop policy if exists "Users can insert own ai uploads" on public.ai_uploads;
drop policy if exists "Users can update own ai uploads" on public.ai_uploads;
drop policy if exists "Users can delete own ai uploads" on public.ai_uploads;
create policy "Users can read own ai uploads" on public.ai_uploads for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own ai uploads" on public.ai_uploads for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own ai uploads" on public.ai_uploads for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete own ai uploads" on public.ai_uploads for delete to authenticated using ((select auth.uid()) = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workout_sets to authenticated;
grant select, insert, update, delete on public.nutrition_logs to authenticated;
grant select, insert, update, delete on public.ai_uploads to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own media" on storage.objects;
drop policy if exists "Users can upload own media" on storage.objects;
drop policy if exists "Users can update own media" on storage.objects;
drop policy if exists "Users can delete own media" on storage.objects;
create policy "Users can read own media" on storage.objects for select to authenticated
using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload own media" on storage.objects for insert to authenticated
with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update own media" on storage.objects for update to authenticated
using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete own media" on storage.objects for delete to authenticated
using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.match_documents(query_embedding vector(384), match_count integer default 5)
returns table (
  id uuid,
  doc_id uuid,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    rag_chunks.id,
    rag_chunks.document_id as doc_id,
    rag_chunks.content,
    rag_chunks.metadata,
    1 - (rag_chunks.embedding <=> query_embedding) as similarity
  from public.rag_chunks
  where rag_chunks.embedding is not null
  order by rag_chunks.embedding <=> query_embedding
  limit greatest(1, least(match_count, 10));
$$;

revoke all on function public.match_documents(vector(384), integer) from public;
grant execute on function public.match_documents(vector(384), integer) to service_role;
