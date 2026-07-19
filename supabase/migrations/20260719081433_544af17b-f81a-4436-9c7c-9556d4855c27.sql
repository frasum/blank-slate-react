-- RN1: Client-Schreibwege entziehen — Schreiben läuft ausschließlich
-- serverseitig (supabaseAdmin, time-admin.functions). Analog zur
-- payroll_notes-Nachhärtung vom 18.06. (b1412629).

DROP POLICY IF EXISTS prn_insert_manager ON public.payroll_recurring_notes;
DROP POLICY IF EXISTS prn_update_manager ON public.payroll_recurring_notes;

REVOKE INSERT, UPDATE ON public.payroll_recurring_notes FROM authenticated;
