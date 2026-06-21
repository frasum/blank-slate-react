-- claim_task wird ausschließlich über die Server-Fn `claimTask` (service_role) aufgerufen.
-- Der bisherige authenticated-Grant erlaubte einen direkten PostgREST-Aufruf, der das
-- Audit-Log (task.claimed) umgeht. Wir normalisieren auf das Muster der anderen Task-RPCs:
-- nur service_role darf EXECUTE.
REVOKE EXECUTE ON FUNCTION public.claim_task(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid) TO service_role;