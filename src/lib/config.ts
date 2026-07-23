// Kanonische App-URL für Auth-Redirects (Invite-, Recovery-Mails).
// Auth-Redirects niemals aus Request-Origin ableiten — 23.07.2026,
// localhost-Vorfall (Frank): resolveRequestOrigin lieferte im Server-/
// Build-Kontext http://localhost:3000, was zu „Server not found" beim
// Klick auf Einladungs-Mail-Links führte.
//
// Wert ist per Env (APP_URL) für Staging übersteuerbar, hat aber einen
// festen Default auf die Produktions-URL — kein Raten aus Headern.

const RAW_APP_URL = (process.env.APP_URL ?? "https://cocoplatform.online").trim();

export const APP_URL: string = RAW_APP_URL.replace(/\/+$/, "");

export function authRedirectUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${suffix}`;
}