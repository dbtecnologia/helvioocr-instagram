create extension if not exists pgcrypto;

create table if not exists public.supermarkets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instagram_handle text not null,
  instagram_url text not null default '',
  city text not null,
  neighborhood text not null,
  address text,
  network text,
  active boolean not null default true,
  monitoring_frequency text not null default 'weekly' check (monitoring_frequency in ('daily','weekly','manual')),
  notes text,
  last_collection_at timestamptz,
  flyer_count integer not null default 0 check (flyer_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_jobs (
  id uuid primary key default gen_random_uuid(),
  supermarket_id uuid references public.supermarkets(id) on delete set null,
  source_type text not null check (source_type in ('instagram_graph','authorized_connector','upload','url','zip')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  supermarket_id uuid not null references public.supermarkets(id) on delete cascade,
  external_id text,
  source_url text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  caption text,
  content_hash text not null,
  media_urls jsonb not null default '[]'::jsonb,
  media_type text,
  unique (supermarket_id, content_hash),
  unique (supermarket_id, external_id)
);

create table if not exists public.flyer_images (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid references public.publications(id) on delete cascade,
  storage_path text not null unique,
  image_hash text not null unique,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  processing_status text not null default 'uploaded' check (processing_status in ('uploaded','queued','processing','completed','needs_review','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  category text,
  brand text,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  supermarket_id uuid not null references public.supermarkets(id) on delete cascade,
  publication_id uuid references public.publications(id) on delete set null,
  flyer_image_id uuid references public.flyer_images(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  raw_product_name text not null,
  brand text,
  quantity numeric,
  unit text,
  price numeric(12,2) not null check (price >= 0),
  previous_price numeric(12,2) check (previous_price is null or previous_price >= 0),
  unit_price numeric(12,4) check (unit_price is null or unit_price >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  promotion_conditions text,
  valid_from date,
  valid_until date,
  confidence_score numeric(4,3) not null check (confidence_score between 0 and 1),
  review_status text not null default 'pending' check (review_status in ('pending','needs_review','approved','rejected')),
  extracted_at timestamptz not null default now(),
  approved_at timestamptz,
  source_url text
);

create table if not exists public.extraction_results (
  id uuid primary key default gen_random_uuid(),
  flyer_image_id uuid not null references public.flyer_images(id) on delete cascade,
  raw_ocr_text text not null default '',
  ocr_blocks jsonb not null default '[]'::jsonb,
  model_name text,
  model_version text,
  extraction_json jsonb not null default '{}'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  estimated_cost numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.offer_corrections (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  original_data jsonb not null,
  corrected_data jsonb not null,
  corrected_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_name text not null,
  status text not null check (status in ('running','completed','failed','cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  logs jsonb not null default '[]'::jsonb
);

create index if not exists supermarkets_active_idx on public.supermarkets(active);
create index if not exists publications_supermarket_published_idx on public.publications(supermarket_id, published_at desc);
create index if not exists offers_product_price_idx on public.offers(product_id, price);
create index if not exists offers_review_status_idx on public.offers(review_status);
create index if not exists offers_extracted_at_idx on public.offers(extracted_at desc);
create index if not exists extraction_results_image_idx on public.extraction_results(flyer_image_id, created_at desc);

alter table public.supermarkets enable row level security;
alter table public.collection_jobs enable row level security;
alter table public.publications enable row level security;
alter table public.flyer_images enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.extraction_results enable row level security;
alter table public.offer_corrections enable row level security;
alter table public.automation_runs enable row level security;

create policy "authenticated users manage supermarkets" on public.supermarkets for all to authenticated using (true) with check (true);
create policy "authenticated users manage collection jobs" on public.collection_jobs for all to authenticated using (true) with check (true);
create policy "authenticated users manage publications" on public.publications for all to authenticated using (true) with check (true);
create policy "authenticated users manage flyer images" on public.flyer_images for all to authenticated using (true) with check (true);
create policy "authenticated users manage products" on public.products for all to authenticated using (true) with check (true);
create policy "authenticated users manage offers" on public.offers for all to authenticated using (true) with check (true);
create policy "authenticated users manage extraction results" on public.extraction_results for all to authenticated using (true) with check (true);
create policy "authenticated users manage offer corrections" on public.offer_corrections for all to authenticated using (true) with check (true);
create policy "authenticated users manage automation runs" on public.automation_runs for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('flyer-images', 'flyer-images', false) on conflict (id) do nothing;
create policy "authenticated users read flyer images" on storage.objects for select to authenticated using (bucket_id = 'flyer-images');
create policy "authenticated users upload flyer images" on storage.objects for insert to authenticated with check (bucket_id = 'flyer-images');
create policy "authenticated users update flyer images" on storage.objects for update to authenticated using (bucket_id = 'flyer-images') with check (bucket_id = 'flyer-images');

