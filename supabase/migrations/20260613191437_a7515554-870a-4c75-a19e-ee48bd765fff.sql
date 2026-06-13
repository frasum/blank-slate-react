
-- ============================================================
-- B3-Modellkorrektur Teil A: Standorte in der Kasse
-- ============================================================

-- 0) Sicherheits-Backfill: jede Organisation braucht mindestens
--    einen Standort, sonst schlagen die NOT-NULL-Constraints fehl.
INSERT INTO public.locations (organization_id, name)
SELECT o.id, 'Hauptstandort'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.organization_id = o.id
);

-- ------------------------------------------------------------
-- 1) sessions.location_id
-- ------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

UPDATE public.sessions s
SET location_id = (
  SELECT l.id FROM public.locations l
  WHERE l.organization_id = s.organization_id
  ORDER BY l.created_at ASC, l.id ASC
  LIMIT 1
)
WHERE s.location_id IS NULL;

ALTER TABLE public.sessions ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_organization_id_business_date_key;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_org_loc_date_key
  UNIQUE (organization_id, location_id, business_date);

DROP INDEX IF EXISTS public.sessions_org_date_idx;
CREATE INDEX sessions_org_loc_date_idx
  ON public.sessions (organization_id, location_id, business_date DESC);

-- ------------------------------------------------------------
-- 2) revenue_channels.location_id
-- ------------------------------------------------------------
ALTER TABLE public.revenue_channels
  ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

UPDATE public.revenue_channels rc
SET location_id = (
  SELECT l.id FROM public.locations l
  WHERE l.organization_id = rc.organization_id
  ORDER BY l.created_at ASC, l.id ASC
  LIMIT 1
)
WHERE rc.location_id IS NULL;

ALTER TABLE public.revenue_channels ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.revenue_channels
  DROP CONSTRAINT IF EXISTS revenue_channels_organization_id_label_key;
ALTER TABLE public.revenue_channels
  ADD CONSTRAINT revenue_channels_org_loc_label_key
  UNIQUE (organization_id, location_id, label);

CREATE INDEX IF NOT EXISTS revenue_channels_org_loc_idx
  ON public.revenue_channels (organization_id, location_id, sort_order);

-- ------------------------------------------------------------
-- 3) payment_terminals.location_id
-- ------------------------------------------------------------
ALTER TABLE public.payment_terminals
  ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

UPDATE public.payment_terminals pt
SET location_id = (
  SELECT l.id FROM public.locations l
  WHERE l.organization_id = pt.organization_id
  ORDER BY l.created_at ASC, l.id ASC
  LIMIT 1
)
WHERE pt.location_id IS NULL;

ALTER TABLE public.payment_terminals ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.payment_terminals
  DROP CONSTRAINT IF EXISTS payment_terminals_organization_id_label_key;
ALTER TABLE public.payment_terminals
  ADD CONSTRAINT payment_terminals_org_loc_label_key
  UNIQUE (organization_id, location_id, label);

CREATE INDEX IF NOT EXISTS payment_terminals_org_loc_idx
  ON public.payment_terminals (organization_id, location_id, sort_order);

-- ------------------------------------------------------------
-- 4) cash_locks — Wasserlinie pro Standort
-- ------------------------------------------------------------
CREATE TABLE public.cash_locks (
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id        uuid NOT NULL REFERENCES public.locations(id)     ON DELETE CASCADE,
  locked_through_date date NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES public.staff(id),
  PRIMARY KEY (organization_id, location_id)
);

GRANT SELECT ON public.cash_locks TO authenticated;
GRANT ALL ON public.cash_locks TO service_role;

ALTER TABLE public.cash_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_locks_select_own_org" ON public.cash_locks
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE TRIGGER tg_cash_locks_updated_at
  BEFORE UPDATE ON public.cash_locks
  FOR EACH ROW EXECUTE FUNCTION public.tg_time_entries_set_updated_at();

-- Backfill aus organization_settings.cash_locked_through_date:
-- bestehender Wert wird auf jeden Standort der Organisation gespiegelt.
INSERT INTO public.cash_locks (organization_id, location_id, locked_through_date)
SELECT os.organization_id, l.id, os.cash_locked_through_date
FROM public.organization_settings os
JOIN public.locations l ON l.organization_id = os.organization_id
WHERE os.cash_locked_through_date IS NOT NULL
ON CONFLICT (organization_id, location_id) DO NOTHING;

ALTER TABLE public.organization_settings
  DROP COLUMN IF EXISTS cash_locked_through_date;

-- ------------------------------------------------------------
-- 5) waiter_settlements: staff_locations-Bindung erzwingen
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "ws_insert_self_today_draft" ON public.waiter_settlements;

CREATE POLICY "ws_insert_self_today_draft" ON public.waiter_settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND staff_id     = public.current_staff_id()
    AND status       = 'draft'
    AND EXISTS (
      SELECT 1
      FROM public.sessions s
      JOIN public.staff_locations sl
        ON sl.organization_id = s.organization_id
       AND sl.location_id     = s.location_id
       AND sl.staff_id        = waiter_settlements.staff_id
      WHERE s.id              = waiter_settlements.session_id
        AND s.organization_id = waiter_settlements.organization_id
        AND s.business_date   = public.current_business_date()
        AND s.status          = 'open'
    )
  );
