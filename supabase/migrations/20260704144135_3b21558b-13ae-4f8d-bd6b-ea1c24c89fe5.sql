CREATE TABLE public.shift_swap_declines (
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