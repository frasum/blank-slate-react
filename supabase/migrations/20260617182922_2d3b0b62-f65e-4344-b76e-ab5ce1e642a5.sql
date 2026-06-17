-- Welle C — Urlaubsanträge (leave_requests)
-- Idempotenter Spiegel der bereits vom Betreiber angelegten Struktur:
-- Tabelle, RLS, SELECT-Policy (org-scoped, lesen für Eigentümer/Manager via has_role),
-- SQL-Funktion approve_leave_request (Genehmigung expandiert roster_absence).
-- KEINE Client-Schreib-Policies; Inserts/Updates laufen ausschließlich über
-- guarded Server-Functions mit supabaseAdmin (service_role).

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'offen',
  decided_by_staff_id uuid REFERENCES public.staff(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO anon;
GRANT ALL ON public.leave_requests TO service_role;

CREATE INDEX IF NOT EXISTS leave_requests_org_status_idx
  ON public.leave_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS leave_requests_staff_idx
  ON public.leave_requests (staff_id, created_at DESC);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_requests_select_org ON public.leave_requests;
CREATE POLICY leave_requests_select_org ON public.leave_requests
  FOR SELECT
  USING (organization_id = public.current_organization_id());

-- SQL-Funktion: genehmigt Antrag und expandiert Datumsbereich nach roster_absence.
CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_request_id uuid,
  p_decided_by uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_status text;
begin
  select status into v_status from public.leave_requests where id = p_request_id for update;
  if v_status is null then raise exception 'leave_request % nicht gefunden', p_request_id; end if;
  if v_status <> 'offen' then raise exception 'leave_request % ist nicht offen (%)', p_request_id, v_status; end if;

  update public.leave_requests
     set status='genehmigt', decided_by_staff_id=p_decided_by, decided_at=now(), decision_note=p_note
   where id = p_request_id;

  insert into public.roster_absence (organization_id, staff_id, date, type)
  select lr.organization_id, lr.staff_id, d::date, 'urlaub'
    from public.leave_requests lr
    cross join generate_series(lr.start_date, lr.end_date, interval '1 day') d
   where lr.id = p_request_id
  on conflict (staff_id, date) do nothing;
end;
$function$;