// Client-seitiger Middleware-Wrapper für ALLE Server-Function-Aufrufe.
// Loggt bei Fehlern (oder Non-2xx-Response) eine kompakte Diagnose-Zeile
// mit Funktionsname (aus URL-Hash, falls vorhanden), HTTP-Status, Dauer,
// aktueller Browser-Route, Payload (data) und Zeitstempel.
//
// Ziel: 500er von /_serverFn/* nicht mehr nur als "die App ist 500" in der
// Browser-Konsole stehen lassen, sondern direkt die echte Ursache zeigen
// (welche Funktion, welche Argumente, welche Seite war offen).

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

type AnyRecord = Record<string, unknown>;

function decodeFnFromUrl(url: string): { file?: string; export?: string } {
  try {
    const m = url.match(/\/_serverFn\/([^/?#]+)/);
    if (!m) return {};
    const json = atob(decodeURIComponent(m[1]));
    const parsed = JSON.parse(json) as { file?: string; export?: string };
    return { file: parsed.file, export: parsed.export };
  } catch {
    return {};
  }
}

let fetchPatched = false;
export function installServerFnFetchLogger(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isServerFn = url.includes("/_serverFn/");
    const startedAt = performance.now();
    try {
      const res = await orig(input, init);
      if (isServerFn && res.status >= 400) {
        const { file, export: exp } = decodeFnFromUrl(url);
        // eslint-disable-next-line no-console
        console.error("[serverFn HTTP " + res.status + "]", {
          fn: exp,
          file,
          method: init?.method ?? "GET",
          durationMs: Math.round(performance.now() - startedAt),
          route: window.location.pathname + window.location.search,
          startedAt: new Date().toISOString(),
          url,
        });
      }
      return res;
    } catch (err) {
      if (isServerFn) {
        const { file, export: exp } = decodeFnFromUrl(url);
        // eslint-disable-next-line no-console
        console.error("[serverFn fetch failed]", {
          fn: exp,
          file,
          method: init?.method ?? "GET",
          durationMs: Math.round(performance.now() - startedAt),
          route: window.location.pathname + window.location.search,
          startedAt: new Date().toISOString(),
          error: (err as Error)?.message ?? String(err),
        });
      }
      throw err;
    }
  };
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
        stack: e?.stack,
      });
      throw err;
    }
  },
);

// Server-seitiges Gegenstück: loggt im Worker bei Fehlern oder ≥400-Responses
// die echte Ursache (Funktion aus URL-Hash, Methode, Referer-Pfad, Payload,
// Stack). So sind Details auch ohne Browser-Konsole in den Worker-Logs sichtbar.
export const logServerFnErrorsServer = createMiddleware({ type: "function" }).server(
  async ({ next, data }) => {
    const startedAt = Date.now();
    const isoStart = new Date(startedAt).toISOString();
    let req: Request | undefined;
    try {
      req = getRequest();
    } catch {
      // außerhalb Request-Kontext (z. B. Tests) → ignorieren
    }
    const url = req?.url ?? "";
    const method = req?.method ?? "";
    const referer = req?.headers.get("referer") ?? "";
    const { file, export: exp } = url ? decodeFnFromUrl(url) : {};
    try {
      const result = await next();
      const status = (result as AnyRecord | undefined)?.response as
        | { status?: number }
        | undefined;
      if (status?.status && status.status >= 400) {
        // eslint-disable-next-line no-console
        console.error("[serverFn server ≥400]", {
          fn: exp,
          file,
          status: status.status,
          method,
          referer,
          url,
          durationMs: Date.now() - startedAt,
          startedAt: isoStart,
          data: safePreview(data),
        });
      }
      return result;
    } catch (err) {
      const e = err as
        | (Error & { status?: number; statusCode?: number; response?: { status?: number } })
        | undefined;
      // eslint-disable-next-line no-console
      console.error("[serverFn server error]", {
        fn: exp,
        file,
        name: e?.name,
        message: e?.message ?? String(err),
        status: e?.status ?? e?.statusCode ?? e?.response?.status,
        method,
        referer,
        url,
        durationMs: Date.now() - startedAt,
        startedAt: isoStart,
        data: safePreview(data),
        stack: e?.stack,
      });
      throw err;
    }
  },
);