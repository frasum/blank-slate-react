-- M1 Permissions: Enum erweitern. Seeding separat in
-- 20260618060543_time_permission_defaults.sql — die frueheren nackten
-- COMMIT;/BEGIN;-Statements hier brachen `supabase db reset`.
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
