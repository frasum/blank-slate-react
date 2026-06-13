import { describe, expect, it } from "vitest";
import { assertCounterBalance, emptyCounters } from "./run-import-core";

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
