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

export type SupabaseErrorLike = { message: string; code?: string | null };
export type SupabaseResultLike<T> = {
  data: T | null | undefined;
  error: SupabaseErrorLike | null;
};

// H2/P2 — optionaler Reporter-Hook. Der Client registriert hier den Sentry-
// Forwarder (siehe sentry-client.ts). Server-Pfade lassen den Reporter leer;
// dort läuft die Sentry-Anbindung ohnehin über runGuarded/sentry.server.
export type SupabaseErrorReporter = (
  context: string,
  error: SupabaseErrorLike,
  kind: "expectOk" | "expectMaybe" | "expectVoid",
) => void;

let reporter: SupabaseErrorReporter | null = null;

export function registerSupabaseErrorReporter(fn: SupabaseErrorReporter | null): void {
  reporter = fn;
}

function report(
  context: string,
  error: SupabaseErrorLike,
  kind: "expectOk" | "expectMaybe" | "expectVoid",
): void {
  if (!reporter) return;
  try {
    reporter(context, error, kind);
  } catch {
    /* Reporter darf nichts brechen. */
  }
}

function logFailure(context: string, error: { message: string; code?: string | null }): void {
  // Serverseitige Fehler landen so in den Function-Logs; im Browser in der
  // DevTools-Konsole. Kein Zusatz-Framework, damit der Helfer überall läuft.
  console.error(`[${context}] Supabase: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

export function expectOk<T>(
  result: { data: T | null | undefined; error: SupabaseErrorLike | null },
  context: string,
): T {
  if (result.error) {
    logFailure(context, result.error);
    report(context, result.error, "expectOk");
    throw new Error(`[${context}] Supabase: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    report(context, { message: "kein Ergebnis" }, "expectOk");
    throw new Error(`[${context}] Supabase: kein Ergebnis`);
  }
  return result.data;
}

export function expectMaybe<T>(
  result: { data: T | null | undefined; error: SupabaseErrorLike | null },
  context: string,
): T | null {
  if (result.error) {
    // PGRST116 = „no rows returned" bei .single() — erlaubtes „nicht gefunden".
    if (result.error.code === "PGRST116") return null;
    logFailure(context, result.error);
    report(context, result.error, "expectMaybe");
    throw new Error(`[${context}] Supabase: ${result.error.message}`);
  }
  return result.data ?? null;
}

export function expectVoid(result: { error: SupabaseErrorLike | null }, context: string): void {
  if (result.error) {
    logFailure(context, result.error);
    report(context, result.error, "expectVoid");
    throw new Error(`[${context}] Supabase: ${result.error.message}`);
  }
}
