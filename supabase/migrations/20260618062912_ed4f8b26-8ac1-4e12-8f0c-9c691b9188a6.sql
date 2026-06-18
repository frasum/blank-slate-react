-- M3 Dienstplan: Permission-Keys + Defaults

ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.shift.view_self';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.shift.view_all';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.shift.manage';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.availability.manage_self';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.availability.manage_all';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.absence.view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.absence.manage';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.wish.create_self';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.wish.view_all';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.wish.manage_all';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.leave.request_self';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.leave.view_all';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.leave.decide';