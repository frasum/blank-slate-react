// Hardening-Header für HTML-Responses (im Worker-fetch-Wrapper angewandt).
// CSP bewusst NUR Report-Only: eine scharfe CSP kann Inline-Styles/Scripts des
// SSR-React-Apps brechen. Scharfschalten ist ein separater, späterer Schritt
// nach Auswertung der Violation-Reports.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  // wss für Supabase Realtime (Dienstplan: postgres_changes über WebSocket) —
  // ohne wss würde die scharfe CSP später die Live-Updates blockieren.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "base-uri 'self'",
  // Framing wird hierüber gescoped — NICHT über X-Frame-Options (all-or-nothing,
  // könnte das legitime Lovable-Editor-iframe nicht erlauben). Editor (lovable.dev)
  // darf framen, Dritte nicht. Aktuell Report-Only → blockiert noch nicht;
  // Scharfschalten von frame-ancestors ist ein separater Schritt.
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev",
].join("; ");

export function withSecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response; // nur HTML

  const headers = new Headers(response.headers); // bestehende übernehmen
  const set = (key: string, value: string) => {
    if (!headers.has(key)) headers.set(key, value); // nie überschreiben
  };

  // KEIN X-Frame-Options: DENY — würde das Lovable-Editor-iframe blockieren.
  // Ein evtl. vorgelagert gesetztes aktiv entfernen.
  headers.delete("X-Frame-Options");

  set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  set("X-Content-Type-Options", "nosniff");
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  set("Content-Security-Policy-Report-Only", CSP);

  // Neues Response-Objekt: Worker-Response-Header können immutable sein.
  // Body-Stream wird durchgereicht.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
