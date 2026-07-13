// H2 — Fehler-Helfer für Supabase-Aufrufe.
//
// Zweck: das stille Verschlucken von PostgREST-/Auth-Fehlern beenden.
// Vor H2 wurden viele Calls per `const { data } = await …` destrukturiert
// und der `error` implizit fallen gelassen — Diagnose-Blindflug (N9).
//
// Nutzung:
//   const staff = expectOk(await supabase.from("staff").select("id").eq(...).maybeSingle(), "loadStaff");
//   const maybe = expectMaybe(await supabase.from("staff")...maybeSingle(), "lookupStaff");
//   expectVoid(await supabase.from("staff").update(...).eq(...), "updateStaff");
//
// Regeln:
// - `expectOk` wirft, wenn `error` gesetzt ist ODER `data` null/undefined ist.
// - `expectMaybe` wirft nur bei echtem Fehler; „nicht gefunden" (PGRST116 oder
//   `data === null`) ist zulässig und wird als `null` zurückgegeben.
// - `expectVoid` ist für schreibende Aufrufe ohne Rückgabewert.
// Alle drei loggen den Fehler mit Kontext, bevor sie werfen.

export type SupabaseResultLike<T> = {
  data: T | null | undefined;
  error: { message: string; code?: string | null } | null;
};

function logFailure(context: string, error: { message: string; code?: string | null }): void {
  // Serverseitige Fehler landen so in den Function-Logs; im Browser in der
  // DevTools-Konsole. Kein Zusatz-Framework, damit der Helfer überall läuft.
  // eslint-disable-next-line no-console
  console.error(`[${context}] Supabase: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

export function expectOk<T>(result: SupabaseResultLike<T>, context: string): T {
  if (result.error) {
    logFailure(context, result.error);
    throw new Error(`[${context}] Supabase: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`[${context}] Supabase: kein Ergebnis`);
  }
  return result.data;
}

export function expectMaybe<T>(result: SupabaseResultLike<T>, context: string): T | null {
  if (result.error) {
    // PGRST116 = „no rows returned" bei .single() — erlaubtes „nicht gefunden".
    if (result.error.code === "PGRST116") return null;
    logFailure(context, result.error);
    throw new Error(`[${context}] Supabase: ${result.error.message}`);
  }
  return result.data ?? null;
}

export function expectVoid(
  result: { error: { message: string; code?: string | null } | null },
  context: string,
): void {
  if (result.error) {
    logFailure(context, result.error);
    throw new Error(`[${context}] Supabase: ${result.error.message}`);
  }
}