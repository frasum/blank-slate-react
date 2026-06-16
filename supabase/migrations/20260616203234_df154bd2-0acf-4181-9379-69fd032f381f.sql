-- Paar-Abrechnung: optionaler Partner-Kellner auf waiter_settlements.

ALTER TABLE public.waiter_settlements
  ADD COLUMN partner_staff_id uuid NULL
    REFERENCES public.staff(id) ON DELETE RESTRICT;

ALTER TABLE public.waiter_settlements
  ADD CONSTRAINT waiter_settlements_partner_not_self
  CHECK (partner_staff_id IS NULL OR partner_staff_id <> staff_id);

-- Partieller Unique-Index: Partner darf pro Session nur einmal aktiv sein.
CREATE UNIQUE INDEX waiter_settlements_active_partner_unique
  ON public.waiter_settlements (session_id, partner_staff_id)
  WHERE partner_staff_id IS NOT NULL AND status <> 'superseded';

CREATE INDEX ws_partner_idx
  ON public.waiter_settlements (organization_id, partner_staff_id);

-- SELECT-Policy erweitern: Partner darf gemeinsame Zeile lesen.
DROP POLICY IF EXISTS "ws_select_own_staff" ON public.waiter_settlements;
CREATE POLICY "ws_select_own_staff" ON public.waiter_settlements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      staff_id = public.current_staff_id()
      OR partner_staff_id = public.current_staff_id()
      OR public.has_min_permission('manager')
    )
  );