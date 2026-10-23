alter table public.supermarkets
  add column if not exists market_type text not null default 'competitor';

alter table public.supermarkets
  drop constraint if exists supermarkets_market_type_check;

alter table public.supermarkets
  add constraint supermarkets_market_type_check
  check (market_type in ('own', 'competitor'));

alter table public.supermarkets
  add column if not exists monitoring_enabled boolean not null default false;

alter table public.supermarkets
  drop constraint if exists supermarkets_monitoring_frequency_check;

alter table public.supermarkets
  add constraint supermarkets_monitoring_frequency_check
  check (monitoring_frequency in ('minute', 'daily', 'weekly', 'manual'));

create unique index if not exists supermarkets_single_own_market_idx
  on public.supermarkets (market_type)
  where market_type = 'own';
