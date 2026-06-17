ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocoded_address text;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_geofence_radius_m_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_geofence_radius_m_check
  CHECK (geofence_radius_m BETWEEN 10 AND 5000);

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_lat_range_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_lat_range_check
  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90));

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_lng_range_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_lng_range_check
  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));