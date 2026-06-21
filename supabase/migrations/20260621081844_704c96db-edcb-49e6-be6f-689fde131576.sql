-- =========================================================================
-- Tasks — Permission-Defaults (nachgezogen; fehlte im Kanban-Erst-Bau)
-- Membership = allow. admin-Zeilen sind belt-and-suspenders (has_permission
-- schließt admin ohnehin kurz); die manager-Zeilen sind die funktional nötigen.
-- =========================================================================
INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('admin',   'tasks.view'),
  ('admin',   'tasks.create'),
  ('admin',   'tasks.assign'),
  ('admin',   'tasks.change_status'),
  ('admin',   'tasks.delete'),
  ('manager', 'tasks.view'),
  ('manager', 'tasks.create'),
  ('manager', 'tasks.assign'),
  ('manager', 'tasks.change_status')
ON CONFLICT (role, permission) DO NOTHING;
-- KEINE staff-Zeilen (Phase 1). KEIN ('manager','tasks.delete') — Archivieren bleibt Admin.
