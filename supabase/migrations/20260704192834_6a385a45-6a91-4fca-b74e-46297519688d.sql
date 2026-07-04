
CREATE TABLE public.task_photos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id              uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  storage_path         text NOT NULL,
  mime_type            text NOT NULL,
  size_bytes           bigint NOT NULL CHECK (size_bytes > 0),
  uploaded_by_staff_id uuid NOT NULL REFERENCES public.staff(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_photos_task_idx ON public.task_photos (task_id);

-- DENY-ALL: nur service_role greift zu. Kein GRANT für anon/authenticated.
GRANT ALL ON public.task_photos TO service_role;

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;
-- Keine Policies: alle Client-Zugriffe (anon/authenticated) laufen ins Leere.
-- Sämtliche Lese-/Schreib-/Löschpfade laufen serverseitig über Server-Fn.
