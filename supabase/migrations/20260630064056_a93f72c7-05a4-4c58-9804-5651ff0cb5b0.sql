alter table public.session_tip_pool_entries
  add column if not exists participates boolean;
comment on column public.session_tip_pool_entries.participates is
  'Session-Übersteuerung der Pool-Teilnahme: NULL = Standard (staff.participates_in_pool), true/false = explizit.';