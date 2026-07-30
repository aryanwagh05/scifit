alter table public.profiles
  add column if not exists goal_detail text not null default '',
  add column if not exists equipment text not null default 'Full gym',
  add column if not exists focus_areas text not null default '',
  add column if not exists limitations text not null default '',
  add column if not exists age integer not null default 28 check (age between 13 and 100),
  add column if not exists sex text not null default 'Male';

alter table public.ai_uploads
  add column if not exists mime_type text;

alter table public.rag_documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists external_id text,
  add column if not exists url text,
  add column if not exists journal text,
  add column if not exists published_year text,
  add column if not exists tags text[] not null default '{}';

alter table public.rag_chunks
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists token_count integer not null default 0;

create unique index if not exists rag_documents_user_external_idx
  on public.rag_documents (user_id, external_id);

create index if not exists rag_documents_user_created_idx
  on public.rag_documents (user_id, created_at desc);

create index if not exists rag_documents_global_external_idx
  on public.rag_documents (external_id)
  where user_id is null and external_id is not null;

create index if not exists rag_chunks_user_document_idx
  on public.rag_chunks (user_id, document_id);

drop index if exists rag_chunks_embedding_idx;
create index if not exists rag_chunks_embedding_hnsw_idx
  on public.rag_chunks using hnsw (embedding vector_cosine_ops);

grant select, insert, update, delete on public.rag_documents to service_role;
grant select, insert, update, delete on public.rag_chunks to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.user_research_sources to service_role;

drop function if exists public.match_documents(vector(384), integer);
drop function if exists public.match_rag_chunks(uuid, vector(384), integer);

create or replace function public.match_rag_chunks(
  query_user_id uuid,
  query_embedding vector(384),
  match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  source text,
  url text,
  journal text,
  published_year text,
  tags text[],
  content text,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    rag_chunks.id as chunk_id,
    rag_documents.id as document_id,
    rag_documents.title,
    rag_documents.source,
    rag_documents.url,
    rag_documents.journal,
    rag_documents.published_year,
    rag_documents.tags,
    rag_chunks.content,
    1 - (rag_chunks.embedding <=> query_embedding) as similarity
  from public.rag_chunks
  join public.rag_documents on rag_documents.id = rag_chunks.document_id
  where rag_chunks.embedding is not null
    and (
      rag_chunks.user_id = query_user_id
      or rag_chunks.user_id is null
    )
  order by rag_chunks.embedding <=> query_embedding
  limit greatest(1, least(match_count, 12));
$$;

revoke all on function public.match_rag_chunks(uuid, vector(384), integer) from public;
grant execute on function public.match_rag_chunks(uuid, vector(384), integer) to service_role;
