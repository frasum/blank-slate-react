-- M4: Enum erweitern (separater Transaktionsschritt, Supabase committed jedes Migration-File einzeln)
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.compensation.view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.compensation.edit';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.personal.view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.personal.edit';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.personal.import';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.calc.run';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'payroll.period.view';