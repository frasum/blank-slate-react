import { describe, it, expect } from "vitest";
import { resolveServicePoolEnd } from "./service-pool-end";

// Berlin-Zeit: wir bauen ISO-Strings mit +02:00 (Sommer) / +01:00 (Winter)
// je Testfall. Der businessDate-Wert dient hier nur als semantischer
// Kontext — die Funktion leitet Zeiten aus dem ISO ab.

describe("resolveServicePoolEnd", () => {
  it("Start 16:00, Abgabe 22:45 → 22:45 / 0 / 405", () => {
    const res = resolveServicePoolEnd({
      shiftStartHHMM: "16:00",
      submissionIso: "2026-07-15T22:45:00+02:00",
      businessDate: "2026-07-15",
    });
    expect(res).toEqual({ shiftEndHHMM: "22:45", dayOffset: 0, hoursMinutes: 405 });
  });

  it("Start 16:00, Abgabe 01:30 (Folgetag) → 01:30 / 1 / 570", () => {
    const res = resolveServicePoolEnd({
      shiftStartHHMM: "16:00",
      submissionIso: "2026-07-16T01:30:00+02:00",
      businessDate: "2026-07-15",
    });
    expect(res).toEqual({ shiftEndHHMM: "01:30", dayOffset: 1, hoursMinutes: 570 });
  });

  it("Start 16:00, Abgabe 15:00 (vor Start) → null", () => {
    const res = resolveServicePoolEnd({
      shiftStartHHMM: "16:00",
      submissionIso: "2026-07-15T15:00:00+02:00",
      businessDate: "2026-07-15",
    });
    expect(res).toBeNull();
  });

  it("shiftStart null → null", () => {
    const res = resolveServicePoolEnd({
      shiftStartHHMM: null,
      submissionIso: "2026-07-15T22:45:00+02:00",
      businessDate: "2026-07-15",
    });
    expect(res).toBeNull();
  });
});