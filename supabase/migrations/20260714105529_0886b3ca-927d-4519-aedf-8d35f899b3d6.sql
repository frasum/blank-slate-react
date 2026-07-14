-- N3-Fix: revoke from PUBLIC in 20260714103711 entzog auch das
-- Default-EXECUTE, über das service_role lief. Der Login-Pfad ruft die
-- Funktion via service_role-RPC — expliziter Grant nötig.
-- Merkregel: REVOKE-from-PUBLIC auf RPC-Funktionen braucht IMMER ein
-- begleitendes GRANT an service_role (Trigger-Funktionen dagegen nicht).

grant execute on function public.pin_attempt_register(uuid, uuid, text, integer, integer, integer)
  to service_role;
