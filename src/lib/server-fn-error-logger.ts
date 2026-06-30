// Client-seitiger Middleware-Wrapper für ALLE Server-Function-Aufrufe.
// Loggt bei Fehlern (oder Non-2xx-Response) eine kompakte Diagnose-Zeile
// mit Funktionsname (aus URL-Hash, falls vorhanden), HTTP-Status, Dauer,
// aktueller Browser-Route, Payload (data) und Zeitstempel.
//
// Ziel: 500er von /_serverFn/* nicht mehr nur als "die App ist 500" in der
// Browser-Konsole stehen lassen, sondern direkt die echte Ursache zeigen
// (welche Funktion, welche Argumente, welche Seite war offen).

import { createMiddleware } from "@tanstack/react-start";

type AnyRecord = Record<string, unknown>;

function decodeFnName(): string {
  // Server-Functions werden über /_serverFn/<base64(json)> aufgerufen.
  // Wir versuchen den Hash aus dem aktuellen XHR-Stack zu lesen — das ist
  // im Client-Middleware-Kontext nicht direkt verfügbar, deshalb fallen
  // wir auf "unknown" zurück, falls der Caller den Namen nicht mitgibt.
  return "unknown";
}

function safePreview(value: unknown, max = 400): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (!s) return String(value);
    return s.length > max ? s.slice(0, max) + `… [+${s.length - max} chars]` : s;
  } catch {
    return String(value);
  }
}

export const logServerFnErrors = createMiddleware({ type: "function" }).client(
  async ({ next, data }) => {
    const startedAt = performance.now();
    const isoStart = new Date().toISOString();
    try {
      const result = await next();
      // Manche Adapter geben ein Result-Objekt mit response/status zurück.
      const status = (result as AnyRecord | undefined)?.response as
        | { status?: number }
        | undefined;
      if (status?.status && status.status >= 400) {
        // eslint-disable-next-line no-console
        console.error("[serverFn ≥400]", {
          status: status.status,
          durationMs: Math.round(performance.now() - startedAt),
          route: typeof window !== "undefined" ? window.location.pathname + window.location.search : "ssr",
          startedAt: isoStart,
          data: safePreview(data),
          fn: decodeFnName(),
        });
      }
      return result;
    } catch (err) {
      const e = err as
        | (Error & { status?: number; statusCode?: number; response?: { status?: number } })
        | undefined;
      // eslint-disable-next-line no-console
      console.error("[serverFn error]", {
        name: e?.name,
        message: e?.message ?? String(err),
        status: e?.status ?? e?.statusCode ?? e?.response?.status,
        durationMs: Math.round(performance.now() - startedAt),
        route:
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "ssr",
        startedAt: isoStart,
        data: safePreview(data),
        fn: decodeFnName(),
        stack: e?.stack,
      });
      throw err;
    }
  },
);