import { describe, expect, it } from "vitest";
import { assertCounterBalance, emptyCounters, resolveLocationId } from "./run-import-core";

describe("assertCounterBalance", () => {
  it("akzeptiert ausgeglichene Zähler", () => {
    const c = emptyCounters();
    c.read = 5;
    c.imported = 3;
    c.skippedByReason.absence = 1;
    c.skippedByReason.duplicate = 1;
    expect(() => assertCounterBalance(c)).not.toThrow();
  });

  it("akzeptiert leere Zähler", () => {
    expect(() => assertCounterBalance(emptyCounters())).not.toThrow();
  });

  it("wirft, wenn imported + skipped != read", () => {
    const c = emptyCounters();
    c.read = 5;
    c.imported = 2;
    c.skippedByReason.absence = 1;
    expect(() => assertCounterBalance(c)).toThrow(/Bilanz-Invariante verletzt/);
  });

  it("erkennt verlorene Zeilen (kein Skip-Bucket erhöht)", () => {
    const c = emptyCounters();
    c.read = 3;
    c.imported = 1;
    expect(() => assertCounterBalance(c)).toThrow(/Differenz=2/);
  });

  it("erkennt Doppelzählung", () => {
    const c = emptyCounters();
    c.read = 2;
    c.imported = 2;
    c.skippedByReason.duplicate = 1;
    expect(() => assertCounterBalance(c)).toThrow(/Differenz=-1/);
  });
});

describe("resolveLocationId", () => {
  const map = new Map<string, string>([
    ["spicery", "loc-sp"],
    ["yum", "loc-yum"],
  ]);

  it("matcht case-insensitiv und trimmt", () => {
    expect(resolveLocationId("Spicery", map)).toBe("loc-sp");
    expect(resolveLocationId("  YUM ", map)).toBe("loc-yum");
  });

  it("liefert null bei fehlendem Namen", () => {
    expect(resolveLocationId(null, map)).toBeNull();
    expect(resolveLocationId("", map)).toBeNull();
  });

  it("liefert null bei unbekanntem Namen", () => {
    expect(resolveLocationId("TSB", map)).toBeNull();
  });
});
