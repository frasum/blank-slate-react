-- BFIX6: Vorgezogen aus 20260704150522 (dort No-op dank IF NOT EXISTS) —
-- shift_swap_declines referenziert die Tabelle per FK, live existierte sie bereits.
CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
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
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shift_swap_declines (
  request_id uuid NOT NULL REFERENCES public.shift_swap_requests(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, staff_id)
);

-- DENY-ALL: keine GRANTs an anon/authenticated, keine Policies.
-- Alle Zugriffe laufen server-seitig über supabaseAdmin nach expliziter Berechtigungsprüfung.
GRANT ALL ON public.shift_swap_declines TO service_role;

ALTER TABLE public.shift_swap_declines ENABLE ROW LEVEL SECURITY;

CREATE INDEX shift_swap_declines_staff_idx
  ON public.shift_swap_declines (staff_id);