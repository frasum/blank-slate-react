import { describe, it, expect } from "vitest";
import { withSecurityHeaders } from "./security-headers";

function htmlResponse(extra?: HeadersInit) {
  return new Response("<!doctype html><html></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...(extra ?? {}) },
  });
}

describe("withSecurityHeaders", () => {
  it("setzt alle Hardening-Header auf HTML-Responses", () => {
    const out = withSecurityHeaders(htmlResponse());
    expect(out.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(out.headers.get("X-Frame-Options")).toBeNull();
    expect(out.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(out.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(out.headers.get("Permissions-Policy")).toBe(
      "geolocation=(self), camera=(), microphone=()",
    );
    expect(out.headers.get("Content-Security-Policy-Report-Only")).not.toBeNull();
  });

  it("erzwingt CSP ausschließlich für frame-ancestors (Rest nur Report-Only)", () => {
    // Gehärtet 13.07. (Nachprüfung): Header ist Pflicht — Entfernen wäre
    // eine stille Clickjacking-Regression.
    const out = withSecurityHeaders(htmlResponse());
    const enforced = out.headers.get("Content-Security-Policy");
    expect(enforced).not.toBeNull();
    expect(enforced!.trim()).toMatch(/^frame-ancestors [^;]+$/);
    const reportOnly = out.headers.get("Content-Security-Policy-Report-Only") ?? "";
    expect(reportOnly).toContain("script-src");
    expect(reportOnly).toContain("default-src");
  });

  it("CSP-Report-Only enthält wss://*.supabase.co und frame-ancestors 'self' https://lovable.dev, und nicht frame-ancestors 'none'", () => {
    const out = withSecurityHeaders(htmlResponse());
    const csp = out.headers.get("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).toContain("wss://*.supabase.co");
    expect(csp).toContain("frame-ancestors 'self' https://lovable.dev");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("lässt Nicht-HTML-Responses unverändert", () => {
    const json = new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const out = withSecurityHeaders(json);
    expect(out).toBe(json);
    expect(out.headers.get("Strict-Transport-Security")).toBeNull();
    expect(out.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });

  it("überschreibt bestehende Header nicht", () => {
    const out = withSecurityHeaders(htmlResponse({ "Referrer-Policy": "no-referrer" }));
    expect(out.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("entfernt vorgelagert gesetztes X-Frame-Options auf HTML-Responses", () => {
    const out = withSecurityHeaders(htmlResponse({ "X-Frame-Options": "DENY" }));
    expect(out.headers.get("X-Frame-Options")).toBeNull();
  });
});
