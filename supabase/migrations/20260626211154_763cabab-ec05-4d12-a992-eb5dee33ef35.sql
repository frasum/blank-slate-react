ALTER TABLE public.staff_personal_details
  ADD COLUMN is_pkv boolean NOT NULL DEFAULT false,
  ADD COLUMN pkv_basis_beitrag_monat_cent integer NOT NULL DEFAULT 0;