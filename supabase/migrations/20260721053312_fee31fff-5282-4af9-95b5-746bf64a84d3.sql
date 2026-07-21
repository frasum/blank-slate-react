ALTER TABLE public.articles
  ADD COLUMN reviewed_at timestamptz NULL,
  ADD COLUMN reviewed_by_staff_id uuid NULL
    REFERENCES public.staff(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';