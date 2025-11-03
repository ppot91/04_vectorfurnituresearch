create extension if not exists vector;

create table if not exists public.furniture_items (
  id uuid primary key default gen_random_uuid(),
  name text,
  image_url text,
  description jsonb not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- Supabase (pgvector) indexes support up to 2000 dimensions, so store the
-- 1536-dim embeddings from text-embedding-3-small using an HNSW index.
create index if not exists furniture_items_embedding_hnsw_idx
  on public.furniture_items using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create or replace function public.match_furniture(
  query_embedding vector(1536),
  match_limit int default 3,
  match_threshold float default 0.0
)
returns table (
  id uuid,
  name text,
  image_url text,
  description jsonb,
  similarity float
)
language plpgsql stable
as $$
begin
  return query
    select
      fi.id,
      fi.name,
      fi.image_url,
      fi.description,
      1 - (fi.embedding <=> query_embedding) as similarity
    from public.furniture_items fi
    where 1 - (fi.embedding <=> query_embedding) >= match_threshold
    order by fi.embedding <=> query_embedding
    limit match_limit;
end;
$$;
