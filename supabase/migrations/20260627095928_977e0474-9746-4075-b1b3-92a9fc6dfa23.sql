alter table public.display_settings
  add column if not exists rotation_enabled boolean not null default false,
  add column if not exists rotation_interval_seconds integer not null default 30,
  add column if not exists show_areas text[],
  add column if not exists show_header boolean not null default true,
  add column if not exists show_footer boolean not null default true,
  add column if not exists custom_message text;

notify pgrst, 'reload schema';