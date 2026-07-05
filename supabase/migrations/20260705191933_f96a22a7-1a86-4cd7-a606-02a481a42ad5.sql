
CREATE OR REPLACE FUNCTION public.replace_pos_sales_stats(
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

  DELETE FROM public.sales_article_stats
   WHERE location_id = p_location_id
     AND period = p_period;

  INSERT INTO public.sales_article_stats
    (organization_id, location_id, period, nummer, name, verkauf_count, umsatz_cents, report_date)
  SELECT p_organization_id,
         p_location_id,
         p_period,
         (e->>'nummer')::int,
         e->>'name',
         (e->>'verkaufCount')::int,
         (e->>'umsatzCents')::bigint,
         p_report_date
    FROM jsonb_array_elements(p_rows) AS e;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_pos_sales_stats(uuid, uuid, text, date, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_pos_sales_stats(uuid, uuid, text, date, jsonb) TO service_role;
