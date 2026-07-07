ALTER TABLE public.locations
  ADD COLUMN tip_service_pool_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN kitchen_tip_rate_override numeric(5,4)
    CHECK (kitchen_tip_rate_override IS NULL
           OR (kitchen_tip_rate_override >= 0 AND kitchen_tip_rate_override <= 0.2)),
  ADD COLUMN tip_pool_min_hours_override numeric(4,1)
    CHECK (tip_pool_min_hours_override IS NULL OR tip_pool_min_hours_override >= 0),
  ADD COLUMN kitchen_manual_only_override boolean;