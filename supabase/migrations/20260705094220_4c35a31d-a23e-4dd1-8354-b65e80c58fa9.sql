DELETE FROM public.permission_role_defaults
 WHERE role = 'planer'::public.app_role
   AND permission = 'roster.leave.view_all'::public.app_permission;