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
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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

// Feldnamen, deren Werte niemals im Log auftauchen dürfen (Substring-Match,
// case-insensitive). Deckt Auth-/PII-Klassiker ab.
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwort",
  "pass_hash",
  "passwordhash",
  "pin",
  "token",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "auth",
  "cookie",
  "session",
  "refresh",
  "access_token",
  "client_secret",
  "iban",
  "bic",
  "ssn",
  "steuer",
  "tax_id",
  "geburts",
  "birthdate",
  "dob",
  "email",
  "e_mail",
  "mail",
  "phone",
  "telefon",
  "mobile",
  "address",
  "adresse",
  "street",
  "strasse",
  "city",
  "ort",
  "plz",
  "postcode",
  "zip",
  "first_name",
  "last_name",
  "firstname",
  "lastname",
  "vorname",
  "nachname",
  "fullname",
  "name",
];

// Werte, die nach E-Mail/JWT/IBAN-Muster aussehen, werden geredacted, auch wenn
// der Key nicht in der Liste oben steht (z. B. positional in Arrays).
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const LONG_HEX_RE = /\b[a-f0-9]{32,}\b/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

function redactString(s: string): string {
  return s
    .replace(EMAIL_RE, "[email-redacted]")
    .replace(JWT_RE, "[jwt-redacted]")
    .replace(IBAN_RE, "[iban-redacted]")
    .replace(LONG_HEX_RE, "[hex-redacted]");
}

function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 6) return "[depth-cap]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  // Functions, Symbols, BigInts etc. → Typname statt Wert.
  return `[${typeof value}]`;
}

function safePreview(value: unknown, max = 400): string {
  try {
    const redacted = redact(value);
    const s = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
    if (!s) return String(redacted);
    return s.length > max ? s.slice(0, max) + `… [+${s.length - max} chars]` : s;
  } catch {
    return "[unserializable]";
  }
}

export const logServerFnErrors = createMiddleware({ type: "function" }).client(
  async ({ next, data }) => {
    const startedAt = performance.now();
    const isoStart = new Date().toISOString();
    try {
      const result = await next();
      // Manche Adapter geben ein Result-Objekt mit response/status zurück.
      const status = (result as AnyRecord | undefined)?.response as { status?: number } | undefined;
      if (status?.status && status.status >= 400) {
        // eslint-disable-next-line no-console
        console.error("[serverFn ≥400]", {
          status: status.status,
          durationMs: Math.round(performance.now() - startedAt),
          route:
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "ssr",
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
          typeof window !== "undefined" ? window.location.pathname + window.location.search : "ssr",
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
      const status = (result as AnyRecord | undefined)?.response as { status?: number } | undefined;
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
