import { describe, it, expect } from "vitest";
import {
  addDays,
  buildWeekColumns,
  fmtHm,
  isoWeek,
  mondayOf,
  nextPeriodFromLast,
  parseIsoDate,
  periodLabelForEnd,
} from "./zeit-uebersicht-core";

describe("isoWeek", () => {
  it("28.12.2026 liegt in KW 53 / 2026", () => {
    const { year, week } = isoWeek(parseIsoDate("2026-12-28"));
    expect(week).toBe(53);
    expect(year).toBe(2026);
  });
  it("04.01.2027 liegt in KW 1 / 2027", () => {
    const { year, week } = isoWeek(parseIsoDate("2027-01-04"));
    expect(week).toBe(1);
    expect(year).toBe(2027);
  });
  it("01.01.2026 liegt in KW 1 / 2026", () => {
    const { year, week } = isoWeek(parseIsoDate("2026-01-01"));
    expect(week).toBe(1);
    expect(year).toBe(2026);
  });
});

describe("mondayOf", () => {
  it("Sonntag geht auf den Montag davor", () => {
    // 2026-07-12 ist ein Sonntag → Montag davor = 2026-07-06
    const m = mondayOf(parseIsoDate("2026-07-12"));
    expect(m.toISOString().slice(0, 10)).toBe("2026-07-06");
  });
  it("Montag bleibt Montag", () => {
    const m = mondayOf(parseIsoDate("2026-07-06"));
    expect(m.toISOString().slice(0, 10)).toBe("2026-07-06");
  });
});

describe("buildWeekColumns", () => {
  it("liefert alle Wochen über eine Monatsgrenze mit KW-Labels", () => {
    const cols = buildWeekColumns("2026-06-29", "2026-07-19");
    // Montage: 29.06., 06.07., 13.07. → 3 Wochen
    expect(cols.length).toBe(3);
    expect(cols[0].start).toBe("2026-06-29");
    expect(cols[0].label.startsWith("KW ")).toBe(true);
    expect(cols[0].label).toContain("29.06.");
    expect(cols[0].label).toContain("05.07.");
    expect(cols[2].start).toBe("2026-07-13");
    expect(cols[2].end).toBe("2026-07-19");
  });
  it("richtet den Anfang auf den zugehörigen Montag aus", () => {
    // Mittwoch 01.07.2026 → Woche startet Mo 29.06.
    const cols = buildWeekColumns("2026-07-01", "2026-07-01");
    expect(cols.length).toBe(1);
    expect(cols[0].start).toBe("2026-06-29");
  });
});

describe("nextPeriodFromLast / periodLabelForEnd", () => {
  it("baut die Folgeperiode 26.→25. mit Monatslabel des Enddatums", () => {
    const np = nextPeriodFromLast("2026-07-25");
    expect(np.startDate).toBe("2026-07-26");
    expect(np.endDate).toBe("2026-08-25");
    expect(np.label).toBe("August 2026");
  });
  it("überträgt Jahreswechsel korrekt (Dez → Jan)", () => {
    const np = nextPeriodFromLast("2026-12-25");
    expect(np.startDate).toBe("2026-12-26");
    expect(np.endDate).toBe("2027-01-25");
    expect(np.label).toBe("Januar 2027");
  });
  it("periodLabelForEnd nimmt Monat des Enddatums", () => {
    expect(periodLabelForEnd("2026-03-25")).toBe("März 2026");
  });
});

describe("fmtHm", () => {
  it("0 Stunden → 0:00", () => {
    expect(fmtHm(0)).toBe("0:00");
  });
  it("negative Stunden → 0:00", () => {
    expect(fmtHm(-1)).toBe("0:00");
  });
  it("7.5 Stunden → 7:30", () => {
    expect(fmtHm(7.5)).toBe("7:30");
  });
});

describe("addDays", () => {
  it("addiert Tage in UTC ohne Mutation der Eingabe", () => {
    const d = parseIsoDate("2026-07-01");
    const d2 = addDays(d, 3);
    expect(d2.toISOString().slice(0, 10)).toBe("2026-07-04");
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
});