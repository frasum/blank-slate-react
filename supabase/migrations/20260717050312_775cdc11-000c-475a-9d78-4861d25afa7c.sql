
-- BM1: Lieferanten-Antworten am Bestellvorgang

create table public.order_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid references public.orders(id) on delete set null,
  from_email text not null,
  from_name text,
  subject text,
  body_text text,
  message_id text,
  received_at timestamptz not null default now(),
  read_at timestamptz,
  assigned_by uuid references public.staff(id),
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, message_id)
);
create index on public.order_replies (organization_id, order_id);
create index on public.order_replies (organization_id, read_at) where order_id is null;

revoke all on public.order_replies from anon, authenticated;
grant select on public.order_replies to authenticated;
grant all on public.order_replies to service_role;

alter table public.order_replies enable row level security;
create policy order_replies_select_manager on public.order_replies
  for select using (organization_id = public.current_organization_id());

create trigger tg_order_replies_updated_at before update on public.order_replies
  for each row execute function public.tg_set_updated_at();

create table public.order_reply_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reply_id uuid not null references public.order_replies(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index on public.order_reply_attachments (reply_id);

revoke all on public.order_reply_attachments from anon, authenticated;
grant select on public.order_reply_attachments to authenticated;
grant all on public.order_reply_attachments to service_role;

alter table public.order_reply_attachments enable row level security;
create policy ora_select_manager on public.order_reply_attachments
  for select using (organization_id = public.current_organization_id());

alter table public.organization_settings
  add column if not exists order_reply_telegram_enabled boolean not null default true,
  add column if not exists order_reply_forward_unassigned boolean not null default true;
