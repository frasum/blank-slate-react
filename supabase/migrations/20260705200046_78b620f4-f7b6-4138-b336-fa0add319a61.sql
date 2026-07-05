-- PV3: POS-Stunden-Statistik je Standort × Periode (Vectron „Stunden-Bericht (lang)").
-- Muster von sales_article_stats (PV1/PV2): DENY-ALL RLS + Service-Role-RPC.

CREATE TABLE public.pos_hourly_stats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id),
  period          text NOT NULL CHECK (period IN ('d365','alltime')),
  hour            int  NOT NULL CHECK (hour BETWEEN 0 AND 23),
  anzahl          int    NOT NULL DEFAULT 0,
  wert_cents      bigint NOT NULL DEFAULT 0,
  report_date     date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_hourly_stats_unique UNIQUE (location_id, period, hour)
);

CREATE INDEX pos_hourly_stats_org_loc_period_idx
  ON public.pos_hourly_stats (organization_id, location_id, period);

GRANT ALL ON public.pos_hourly_stats TO service_role;

ALTER TABLE public.pos_hourly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_hourly_stats deny all"
  ON public.pos_hourly_stats
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.replace_pos_hourly_stats(
  p_organization_id uuid,
  p_location_id uuid,
  p_period text,
  p_report_date date,
  p_rows jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_period NOT IN ('d365','alltime') THEN
    RAISE EXCEPTION 'invalid period: %', p_period;
  END IF;

  DELETE FROM public.pos_hourly_stats
   WHERE location_id = p_location_id
     AND period = p_period;

  INSERT INTO public.pos_hourly_stats
    (organization_id, location_id, period, hour, anzahl, wert_cents, report_date)
  SELECT p_organization_id,
         p_location_id,
         p_period,
         (e->>'hour')::int,
         (e->>'anzahl')::int,
         (e->>'wertCents')::bigint,
         p_report_date
    FROM jsonb_array_elements(p_rows) AS e;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_pos_hourly_stats(uuid, uuid, text, date, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_pos_hourly_stats(uuid, uuid, text, date, jsonb)
  TO service_role;