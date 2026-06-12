import { describe, it, expect } from "vitest";
import {
  evaluatePin,
  PIN_RATE_LIMIT_MAX,
  type PinCompareFn,
} from "./pin-validation";

const matchHash: PinCompareFn = (pin, hash) => pin === hash;

describe("evaluatePin", () => {
  it("akzeptiert korrekten PIN unterhalb der Sperrgrenze", async () => {
    const result = await evaluatePin({
      storedHash: "1234",
      providedPin: "1234",
      recentFailuresInWindow: 0,
      compare: matchHash,
    });
    expect(result).toEqual({ kind: "ok" });
  });

  it("lehnt falschen PIN ab", async () => {
    const result = await evaluatePin({
      storedHash: "1234",
      providedPin: "9999",
      recentFailuresInWindow: 0,
      compare: matchHash,
    });
    expect(result).toEqual({ kind: "rejected", reasonCode: "mismatch" });
  });

  it("sperrt ab dem 5. Fehlversuch — auch bei korrektem PIN", async () => {
    const result = await evaluatePin({
      storedHash: "1234",
      providedPin: "1234",
      recentFailuresInWindow: PIN_RATE_LIMIT_MAX,
      compare: matchHash,
    });
    expect(result).toEqual({ kind: "rejected", reasonCode: "rate_limited" });
  });

  it("lässt nach Ablauf des 15-Min-Fensters (0 Fehlversuche im Fenster) wieder zu", async () => {
    // Das Fenster wird in SQL berechnet — sobald die Aufrufer-Zählung wieder
    // auf 0 fällt, muss evaluatePin den korrekten PIN durchlassen.
    const result = await evaluatePin({
      storedHash: "1234",
      providedPin: "1234",
      recentFailuresInWindow: 0,
      compare: matchHash,
    });
    expect(result).toEqual({ kind: "ok" });
  });

  it("lehnt unbekannten Staff (kein Hash) ab", async () => {
    const result = await evaluatePin({
      storedHash: null,
      providedPin: "1234",
      recentFailuresInWindow: 0,
      compare: matchHash,
    });
    expect(result).toEqual({ kind: "rejected", reasonCode: "no_pin" });
  });

  it("liefert für falsch und unbekannt dieselbe Außenwirkung (kind=rejected)", async () => {
    // Der reasonCode ist NUR für Server-Logging gedacht. Der Aufrufer
    // mappt jede Ablehnung auf dieselbe Fehlerantwort.
    const a = await evaluatePin({
      storedHash: null,
      providedPin: "1234",
      recentFailuresInWindow: 0,
      compare: matchHash,
    });
    const b = await evaluatePin({
      storedHash: "1234",
      providedPin: "9999",
      recentFailuresInWindow: 0,
      compare: matchHash,
    });
    expect(a.kind).toBe("rejected");
    expect(b.kind).toBe("rejected");
  });

  it("Rate-Limit greift VOR dem Hash-Vergleich (compare wird nicht aufgerufen)", async () => {
    let called = false;
    const spyCompare: PinCompareFn = () => {
      called = true;
      return true;
    };
    const result = await evaluatePin({
      storedHash: "1234",
      providedPin: "1234",
      recentFailuresInWindow: PIN_RATE_LIMIT_MAX + 3,
      compare: spyCompare,
    });
    expect(result.kind).toBe("rejected");
    expect(called).toBe(false);
  });
});