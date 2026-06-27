ALTER TABLE public.roster_releases ADD COLUMN area text;

ALTER TABLE public.roster_releases DROP CONSTRAINT roster_releases_location_id_period_id_key;

DELETE FROM public.roster_releases;

INSERT INTO public.roster_releases (organization_id, location_id, period_id, area)
SELECT DISTINCT rs.organization_id, rs.location_id, p.id, rs.area
FROM public.roster_shifts rs
JOIN public.periods p
  ON p.organization_id = rs.organization_id
  AND rs.shift_date BETWEEN p.start_date AND p.end_date
WHERE rs.area IN ('kitchen', 'service')
ON CONFLICT DO NOTHING;

ALTER TABLE public.roster_releases ALTER COLUMN area SET NOT NULL;

ALTER TABLE public.roster_releases
  ADD CONSTRAINT roster_releases_loc_period_area_key UNIQUE (location_id, period_id, area);

NOTIFY pgrst, 'reload schema';