alter table public.supermarkets
  add column if not exists flyer_count integer not null default 0;

alter table public.supermarkets
  drop constraint if exists supermarkets_flyer_count_check;

alter table public.supermarkets
  add constraint supermarkets_flyer_count_check check (flyer_count >= 0);

