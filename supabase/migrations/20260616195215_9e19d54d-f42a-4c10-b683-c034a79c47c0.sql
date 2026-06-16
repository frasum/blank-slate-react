alter table public.sessions
  add column if not exists tip_pool_settlement_only boolean not null default false;