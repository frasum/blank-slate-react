ALTER TABLE public.roster_absence DROP CONSTRAINT roster_absence_type_check;
ALTER TABLE public.roster_absence ADD CONSTRAINT roster_absence_type_check CHECK (type IN ('urlaub','krank'));