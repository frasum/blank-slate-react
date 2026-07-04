
CREATE TABLE public.shift_swap_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_id           uuid NOT NULL REFERENCES public.roster_shifts(id) ON DELETE CASCADE,
  requester_staff_id uuid NOT NULL REFERENCES public.staff(id),
  peer_staff_id      uuid REFERENCES public.staff(id),
  peer_shift_id      uuid REFERENCES public.roster_shifts(id),
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','peer_accepted','approved','rejected','cancelled')),
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz,
  decided_at         timestamptz,
  decided_by         uuid REFERENCES public.staff(id)
);

-- Nur EINE aktive Anfrage pro Schicht.
CREATE UNIQUE INDEX shift_swap_requests_active_shift
  ON public.shift_swap_requests (shift_id)
  WHERE status IN ('open','peer_accepted');

CREATE INDEX shift_swap_requests_org_status_idx
  ON public.shift_swap_requests (organization_id, status);

-- service_role schreibt (Server-Functions via supabaseAdmin);
-- authenticated bekommt KEINEN Zugriff — DENY-ALL für Clients.
GRANT ALL ON public.shift_swap_requests TO service_role;

ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policies: alle Zugriffe laufen ausschließlich über Server-Functions.
