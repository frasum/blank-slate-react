-- M1 Permissions: Enum erweitern (außerhalb der Tx committen, dann seeden)
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.entry.view_self';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.entry.view_all';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.entry.clock';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.entry.edit';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.period.view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.period.manage';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.period.lock';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.payroll_note.view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.payroll_note.edit';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'time.export';

COMMIT;
BEGIN;

-- Default-Matrix
INSERT INTO public.permission_role_defaults(role, permission) VALUES
  -- admin: alle Keys (Admin ignoriert Overrides, dennoch der Vollständigkeit halber)
  ('admin','time.entry.view_self'),
  ('admin','time.entry.view_all'),
  ('admin','time.entry.clock'),
  ('admin','time.entry.edit'),
  ('admin','time.period.view'),
  ('admin','time.period.manage'),
  ('admin','time.period.lock'),
  ('admin','time.payroll_note.view'),
  ('admin','time.payroll_note.edit'),
  ('admin','time.export'),
  -- manager
  ('manager','time.entry.view_self'),
  ('manager','time.entry.view_all'),
  ('manager','time.entry.clock'),
  ('manager','time.entry.edit'),
  ('manager','time.period.view'),
  ('manager','time.payroll_note.view'),
  ('manager','time.payroll_note.edit'),
  ('manager','time.export'),
  -- staff
  ('staff','time.entry.view_self'),
  ('staff','time.entry.clock'),
  -- payroll
  ('payroll','time.entry.view_self'),
  ('payroll','time.entry.view_all'),
  ('payroll','time.period.view'),
  ('payroll','time.period.lock'),
  ('payroll','time.payroll_note.view'),
  ('payroll','time.payroll_note.edit'),
  ('payroll','time.export')
ON CONFLICT (role, permission) DO NOTHING;