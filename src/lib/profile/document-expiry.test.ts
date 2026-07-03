import { describe, it, expect } from "vitest";
import { documentExpiryStatus } from "./document-expiry";

const TODAY = new Date(Date.UTC(2026, 6, 3)); // 2026-07-03

function isoPlusDays(days: number): string {
  const t = Date.UTC(2026, 6, 3) + days * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("documentExpiryStatus", () => {
  it("liefert `none` für null / leer / kaputt", () => {
    expect(documentExpiryStatus(null, TODAY)).toBe("none");
    expect(documentExpiryStatus("", TODAY)).toBe("none");
    expect(documentExpiryStatus(undefined, TODAY)).toBe("none");
    expect(documentExpiryStatus("kein-datum", TODAY)).toBe("none");
  });

  it("gestern → expired", () => {
    expect(documentExpiryStatus(isoPlusDays(-1), TODAY)).toBe("expired");
  });

  it("genau heute → expiring (Grenzfall unten)", () => {
    expect(documentExpiryStatus(isoPlusDays(0), TODAY)).toBe("expiring");
  });

  it("in 30 Tagen → expiring", () => {
    expect(documentExpiryStatus(isoPlusDays(30), TODAY)).toBe("expiring");
  });

  it("genau +60 → expiring (Grenzfall oben)", () => {
    expect(documentExpiryStatus(isoPlusDays(60), TODAY)).toBe("expiring");
  });

  it("+61 → ok", () => {
    expect(documentExpiryStatus(isoPlusDays(61), TODAY)).toBe("ok");
  });

  it("Timestamp mit Uhrzeit wird auf Tagesteil zurückgeschnitten", () => {
    expect(documentExpiryStatus("2026-07-03T23:59:59Z", TODAY)).toBe("expiring");
    expect(documentExpiryStatus("2026-07-02T00:00:00Z", TODAY)).toBe("expired");
  });
});
