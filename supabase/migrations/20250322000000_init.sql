-- NotebookLM-style private KB: schema, RLS, pgvector, RPC

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- Notebooks (per user)
create table public.notebooks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled notebook',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notebooks_user_id_idx on public.notebooks (user_id);

-- Sources: upload | url | search
create table public.sources (
  id uuid primary key default uuid_generate_v4(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('upload', 'url', 'search')),
  title text,
  storage_path text,
  canonical_url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_notebook_id_idx on public.sources (notebook_id);
create index sources_user_id_idx on public.sources (user_id);

-- Chunks with embeddings (text-embedding-3-small = 1536 dims)
create table public.document_chunks (
  id uuid primary key default uuid_generate_v4(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index document_chunks_notebook_id_idx on public.document_chunks (notebook_id);
create index document_chunks_source_id_idx on public.document_chunks (source_id);
create index document_chunks_embedding_idx on public.document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Chat sessions per notebook
create table public.chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_sessions_notebook_id_idx on public.chat_sessions (notebook_id);

-- Messages (role: user | assistant | system)
create table public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_session_id_idx on public.chat_messages (session_id);

-- RLS
alter table public.notebooks enable row level security;
alter table public.sources enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users manage own notebooks"
  on public.notebooks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own sources"
  on public.sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own chunks"
  on public.document_chunks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own chat sessions"
  on public.chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own chat messages"
  on public.chat_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Similarity search scoped to notebook + owner
create or replace function public.match_notebook_chunks(
  query_embedding vector(1536),
  match_notebook_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  content text,
  source_id uuid,
  chunk_index int,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.notebooks n
    where n.id = match_notebook_id and n.user_id = auth.uid()
  ) then
    raise exception 'notebook not found or access denied';
  end if;

  return query
  select
    dc.id,
    dc.content,
    dc.source_id,
    dc.chunk_index,
    (1 - (dc.embedding <=> query_embedding))::float as similarity
  from public.document_chunks dc
  where dc.notebook_id = match_notebook_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit least(match_count, 32);
end;
$$;

grant execute on function public.match_notebook_chunks(vector(1536), uuid, int) to authenticated;

-- Storage bucket (create in dashboard or SQL below)
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

create policy "Users read own source files"
  on storage.objects for select
  using (
    bucket_id = 'sources'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "Users upload own source files"
  on storage.objects for insert
  with check (
    bucket_id = 'sources'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "Users update own source files"
  on storage.objects for update
  using (
    bucket_id = 'sources'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "Users delete own source files"
  on storage.objects for delete
  using (
    bucket_id = 'sources'
    and split_part(name, '/', 1) = auth.uid()::text
  );
