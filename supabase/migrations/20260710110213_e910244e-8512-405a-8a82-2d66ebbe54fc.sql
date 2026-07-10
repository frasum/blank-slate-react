-- SD2: RPC public.replace_staff_locations außer Betrieb nehmen.
-- Grund (Ehrlichkeitsregel): Die Funktion löschte ALLE staff_locations-Zeilen
-- eines Mitarbeiters und legte je Standort exakt eine Zeile mit fest
-- department='service' neu an. Damit vernichtete jeder Aufruf sämtliche
-- Küchen-/GL-Zuordnungen. Ersetzt durch abteilungsgenaue, additive Pflege
-- via setStaffLocationDepartment (schreibt/löscht genau eine (staff, location,
-- department)-Zeile). Migration ist replayfähig (IF EXISTS).
DROP FUNCTION IF EXISTS public.replace_staff_locations(uuid, uuid, uuid[]);