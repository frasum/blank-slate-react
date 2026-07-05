INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('manager','roster.swap.view_pending'),
  ('manager','roster.swap.decide'),
  ('admin','roster.swap.view_pending'),
  ('admin','roster.swap.decide')
ON CONFLICT DO NOTHING;