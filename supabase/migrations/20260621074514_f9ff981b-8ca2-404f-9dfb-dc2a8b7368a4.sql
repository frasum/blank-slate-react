ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks.view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks.create';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks.assign';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks.change_status';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'tasks.delete';