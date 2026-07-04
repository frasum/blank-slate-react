-- Schichttausch TA1 (§55): Anfragen-Tabelle.
-- Bereits am 04.07.2026 live angewendet — diese Datei stellt Repo-Parität her (Nachzug).
-- Inhalte spiegeln den tatsächlichen Live-Zustand (per information_schema/pg_indexes/pg_constraint verifiziert):
--   * organization_id hat FK → organizations(id) ON DELETE CASCADE
--   * zusätzlicher Filterindex (organization_id, status)
--   * KEINE GRANTs live vorhanden — Tabelle ist DENY-ALL, Zugriff nur via supabaseAdmin.
-- Deshalb bewusst kein GRANT ALL ... TO service_role (weicht bewusst vom ursprünglich
-- entworfenen Skript ab; Live-Wahrheit hat Vorrang, Ehrlichkeitsregel).

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

-- Verhindert zwei parallele offene/angenommene Tauschgesuche für dieselbe Schicht.
-- Partieller Index hier OK (kein PostgREST-onConflict-Ziel — §51-Anmerkung in §55).
CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_requests_active_shift
  ON public.shift_swap_requests (shift_id)
  WHERE status IN ('open','peer_accepted');

-- Filterindex für Manager-Übersichten (offene Anfragen je Organisation).
CREATE INDEX IF NOT EXISTS shift_swap_requests_org_status_idx
  ON public.shift_swap_requests (organization_id, status);

ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;
-- DENY-ALL: keine Policies, Zugriff nur über Server-Functions mit supabaseAdmin.