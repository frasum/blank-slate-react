// N13 (Nachprüfung 13.07.): Beide Kurzformatter projizieren Zeitstempel
// einheitlich nach Europe/Berlin — nahe Mitternacht darf kein Aufrufer
// mehr abweichende Kalendertage sehen. Reine Datums-Strings passieren
// weiterhin unverändert (kein tz-Shift).
import { describe, it, expect } from "vitest";
import { formatShortDate, formatShortDateTime } from "./format-date";

describe("formatShortDate / formatShortDateTime — Europe/Berlin (N13)", () => {
  it("Zeitstempel 23:30 UTC im Winter → beide zeigen den Berliner Folgetag", () => {
    // 2026-01-15 23:30 UTC → 2026-01-16 00:30 Berlin (CET, Freitag).
    const ts = "2026-01-15T23:30:00Z";
    expect(formatShortDate(ts)).toBe("Fr 16.01");
    expect(formatShortDateTime(ts)).toBe("Fr 16.01 00:30");
  });

  it("Zeitstempel 23:30 UTC im Sommer → beide zeigen den Berliner Folgetag", () => {
    // 2026-07-15 23:30 UTC → 2026-07-16 01:30 Berlin (CEST, Donnerstag).
    const ts = "2026-07-15T23:30:00Z";
    expect(formatShortDate(ts)).toBe("Do 16.07");
    expect(formatShortDateTime(ts)).toBe("Do 16.07 01:30");
  });

  it("reiner Datums-String durchläuft ohne Zeitzonen-Shift", () => {
    expect(formatShortDate("2026-06-01")).toBe("Mo 01.06");
    expect(formatShortDateTime("2026-06-01")).toBe("Mo 01.06");
  });

  it("ungültige Eingaben werden defensiv durchgereicht", () => {
    expect(formatShortDate("kein-datum")).toBe("kein-datum");
    expect(formatShortDateTime("kein-datum")).toBe("kein-datum");
  });
});
