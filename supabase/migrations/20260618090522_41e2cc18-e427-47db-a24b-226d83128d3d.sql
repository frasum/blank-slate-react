DELETE FROM public.permission_role_defaults
 WHERE role = 'payroll'::public.app_role
   AND permission IN (
     'cash.session.view'::public.app_permission,
     'cash.settlement.view_all'::public.app_permission,
     'cash.export.pdf'::public.app_permission
   );