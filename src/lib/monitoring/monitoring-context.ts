// P1 — Monitoring-Kontext für Server-Functions.
//
// Speichert org-/caller-bezogene Zusatzinfos pro laufender Anfrage, damit der
// Server-Function-Wrapper (runGuarded/runWithPermission) beim Fehlerfall Org-
// und Caller-Tags an Sentry mitschicken kann. Umgesetzt als WeakMap auf dem
// aktuellen `Request` (aus `getRequest()`), sodass keine Signatur-Änderungen
// in bestehenden Aufrufern nötig sind: `loadAdminCaller` trägt den Kontext
// nach dem Laden ein, der Wrapper liest ihn beim Fehlschlag aus.
//
// Best-effort: fällt der Zugriff auf `getRequest()` aus (z. B. in Tests),
// bleibt der Kontext leer — keine Exception, kein Verhaltenswechsel.

export type MonitoringContext = {
  orgId?: string | null;
  callerStaffId?: string | null;
  role?: string | null;
  impersonatedBy?: string | null;
};

const store = new WeakMap<Request, MonitoringContext>();

function currentRequest(): Request | null {
  try {
    // Lazy require: das Modul ist nur zur Laufzeit im Server-Kontext verfügbar.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@tanstack/react-start/server") as {
      getRequest?: () => Request | undefined;
    };
    return mod.getRequest?.() ?? null;
  } catch {
    return null;
  }
}

export function setMonitoringContext(patch: MonitoringContext): void {
  const req = currentRequest();
  if (!req) return;
  const prev = store.get(req) ?? {};
  store.set(req, { ...prev, ...patch });
}

export function getMonitoringContext(): MonitoringContext {
  const req = currentRequest();
  if (!req) return {};
  return store.get(req) ?? {};
}