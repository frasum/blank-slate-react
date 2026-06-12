import { describe, expect, it } from "vitest";
import { businessDateOf } from "./business-date";

// Helfer: Berlin-Wanduhrzeit -> UTC-Date.
// Wir geben den UTC-Offset explizit an, damit Tests DST-unabhängig sind.
function berlin(iso: string, offset: "+01:00" | "+02:00"): Date {
  return new Date(`${iso}${offset}`);
}

describe("businessDateOf (Europe/Berlin, 3-Uhr-Cutoff)", () => {
  it("02:59 Winterzeit zählt zum Vortag", () => {
    expect(businessDateOf(berlin("2026-01-15T02:59:00", "+01:00"))).toBe("2026-01-14");
  });

  it("03:00 Winterzeit ist bereits neuer Geschäftstag", () => {
    expect(businessDateOf(berlin("2026-01-15T03:00:00", "+01:00"))).toBe("2026-01-15");
  });

  it("nach 03:00 Winterzeit unverändert", () => {
    expect(businessDateOf(berlin("2026-01-15T14:30:00", "+01:00"))).toBe("2026-01-15");
  });

  it("Mitternacht zählt zum Vortag", () => {
    expect(businessDateOf(berlin("2026-01-15T00:00:00", "+01:00"))).toBe("2026-01-14");
  });

  it("Monatswechsel: 01.02. 02:30 -> 31.01.", () => {
    expect(businessDateOf(berlin("2026-02-01T02:30:00", "+01:00"))).toBe("2026-01-31");
  });

  it("Jahreswechsel: 01.01. 02:59 -> 31.12. Vorjahr", () => {
    expect(businessDateOf(berlin("2026-01-01T02:59:00", "+01:00"))).toBe("2025-12-31");
  });

  it("Jahreswechsel: 01.01. 03:00 -> 01.01.", () => {
    expect(businessDateOf(berlin("2026-01-01T03:00:00", "+01:00"))).toBe("2026-01-01");
  });

  it("DST-Frühling: 29.03.2026 01:30 Winterzeit (vor DST-Sprung) -> 28.03.", () => {
    // In Deutschland springt die Uhr am letzten So. im März 02:00 -> 03:00.
    // 02:30 Winterzeit existiert in Berlin gar nicht; 01:30 ist eindeutig vor Cutoff.
    expect(businessDateOf(berlin("2026-03-29T01:30:00", "+01:00"))).toBe("2026-03-28");
  });

  it("DST-Frühling: 29.03.2026 03:30 Sommerzeit -> 29.03.", () => {
    expect(businessDateOf(berlin("2026-03-29T03:30:00", "+02:00"))).toBe("2026-03-29");
  });

  it("DST-Herbst: 25.10.2026 02:30 Sommerzeit zählt noch zum Vortag", () => {
    // Am letzten So. im Oktober wird 03:00 -> 02:00 zurückgestellt.
    expect(businessDateOf(berlin("2026-10-25T02:30:00", "+02:00"))).toBe("2026-10-24");
  });

  it("DST-Herbst: 25.10.2026 02:30 Winterzeit (nach Rückstellung) zählt noch zum Vortag", () => {
    expect(businessDateOf(berlin("2026-10-25T02:30:00", "+01:00"))).toBe("2026-10-24");
  });

  it("DST-Herbst: 25.10.2026 04:00 Winterzeit -> 25.10.", () => {
    expect(businessDateOf(berlin("2026-10-25T04:00:00", "+01:00"))).toBe("2026-10-25");
  });

  it("Schaltjahr: 29.02.2024 02:30 -> 28.02.2024", () => {
    expect(businessDateOf(berlin("2024-02-29T02:30:00", "+01:00"))).toBe("2024-02-28");
  });

  it("Schaltjahr: 01.03.2024 02:30 -> 29.02.2024", () => {
    expect(businessDateOf(berlin("2024-03-01T02:30:00", "+01:00"))).toBe("2024-02-29");
  });
});
