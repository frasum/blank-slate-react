-- M3 Defaults seeden
INSERT INTO public.permission_role_defaults (role, permission) VALUES
  -- admin
  ('admin'::public.app_role, 'roster.shift.view_self'::public.app_permission),
  ('admin'::public.app_role, 'roster.shift.view_all'::public.app_permission),
  ('admin'::public.app_role, 'roster.shift.manage'::public.app_permission),
  ('admin'::public.app_role, 'roster.availability.manage_self'::public.app_permission),
  ('admin'::public.app_role, 'roster.availability.manage_all'::public.app_permission),
  ('admin'::public.app_role, 'roster.absence.view'::public.app_permission),
  ('admin'::public.app_role, 'roster.absence.manage'::public.app_permission),
  ('admin'::public.app_role, 'roster.wish.create_self'::public.app_permission),
  ('admin'::public.app_role, 'roster.wish.view_all'::public.app_permission),
  ('admin'::public.app_role, 'roster.wish.manage_all'::public.app_permission),
  ('admin'::public.app_role, 'roster.leave.request_self'::public.app_permission),
  ('admin'::public.app_role, 'roster.leave.view_all'::public.app_permission),
  ('admin'::public.app_role, 'roster.leave.decide'::public.app_permission),
  -- manager
  ('manager'::public.app_role, 'roster.shift.view_self'::public.app_permission),
  ('manager'::public.app_role, 'roster.shift.view_all'::public.app_permission),
  ('manager'::public.app_role, 'roster.shift.manage'::public.app_permission),
  ('manager'::public.app_role, 'roster.availability.manage_self'::public.app_permission),
  ('manager'::public.app_role, 'roster.availability.manage_all'::public.app_permission),
  ('manager'::public.app_role, 'roster.absence.view'::public.app_permission),
  ('manager'::public.app_role, 'roster.absence.manage'::public.app_permission),
  ('manager'::public.app_role, 'roster.wish.create_self'::public.app_permission),
  ('manager'::public.app_role, 'roster.wish.view_all'::public.app_permission),
  ('manager'::public.app_role, 'roster.wish.manage_all'::public.app_permission),
  ('manager'::public.app_role, 'roster.leave.request_self'::public.app_permission),
  ('manager'::public.app_role, 'roster.leave.view_all'::public.app_permission),
  ('manager'::public.app_role, 'roster.leave.decide'::public.app_permission),
  -- staff
  ('staff'::public.app_role, 'roster.shift.view_self'::public.app_permission),
  ('staff'::public.app_role, 'roster.availability.manage_self'::public.app_permission),
  ('staff'::public.app_role, 'roster.wish.create_self'::public.app_permission),
  ('staff'::public.app_role, 'roster.leave.request_self'::public.app_permission)
ON CONFLICT (role, permission) DO NOTHING;
-- payroll: nichts

-- SELECT-Policies neu bauen (Writes laufen via Service-Role + Server-Funktion mit Permission-Gate)

-- roster_shifts
DROP POLICY IF EXISTS roster_shifts_select_org ON public.roster_shifts;
CREATE POLICY roster_shifts_select_view ON public.roster_shifts
  FOR SELECT
  USING (
    organization_id = public.current_organization_id()
    AND (
      staff_id = public.current_staff_id()
      OR public.has_permission('roster.shift.view_all'::public.app_permission)
    )
  );

-- roster_availability
DROP POLICY IF EXISTS roster_availability_select_org ON public.roster_availability;
CREATE POLICY roster_availability_select_view ON public.roster_availability
  FOR SELECT
  USING (
    organization_id = public.current_organization_id()
    AND (
      staff_id = public.current_staff_id()
      OR public.has_permission('roster.availability.manage_all'::public.app_permission)
    )
  );

-- roster_absence
DROP POLICY IF EXISTS roster_absence_select_org ON public.roster_absence;
CREATE POLICY roster_absence_select_view ON public.roster_absence
  FOR SELECT
  USING (
    organization_id = public.current_organization_id()
    AND (
      staff_id = public.current_staff_id()
      OR public.has_permission('roster.absence.view'::public.app_permission)
    )
  );

-- day_off_wishes
DROP POLICY IF EXISTS day_off_wishes_select_own ON public.day_off_wishes;
CREATE POLICY day_off_wishes_select_view ON public.day_off_wishes
  FOR SELECT
  USING (
    staff_id = public.current_staff_id()
    OR public.has_permission('roster.wish.view_all'::public.app_permission)
  );

-- leave_requests
DROP POLICY IF EXISTS leave_requests_select_org ON public.leave_requests;
CREATE POLICY leave_requests_select_view ON public.leave_requests
  FOR SELECT
  USING (
    organization_id = public.current_organization_id()
    AND (
      staff_id = public.current_staff_id()
      OR public.has_permission('roster.leave.view_all'::public.app_permission)
    )
  );