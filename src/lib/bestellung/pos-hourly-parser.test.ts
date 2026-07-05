import { describe, expect, it } from "vitest";
import { allHourlyChecksOk, parsePosHourly } from "./pos-hourly-parser";

const header = ["Nummer", "Anzahl", "Wert", "%Wert", "Arbeitsstunden", "Umsatz pro Arbeitsstunde"];

function hourRow(h: string, anzahl: number | string | null, wert: number | string | null) {
  return [h, anzahl, wert, null, null, null];
}

describe("parsePosHourly", () => {
  it("liest ein sauberes 24-Stunden-Sheet mit Fußzeile", () => {
    const rows: (string | number | null)[][] = [
      header,
      ["-", null, null, null, null, null],
    ];
    for (let h = 0; h < 24; h++) {
      rows.push(hourRow(`${h}:00`, 10, 5)); // 10 * 24 = 240; 5.00 * 24 = 120.00
    }
    rows.push(["Alle (Zeit 00:00 - 23:59)", 240, 120, null, null, null]);
    const p = parsePosHourly(rows);
    expect(p.rows.length).toBe(24);
    expect(p.footer).toEqual({ anzahl: 240, wertCents: 12000 });
    expect(allHourlyChecksOk(p)).toBe(true);
  });

  it("trimmt führende Leerzeichen bei einstelligen Stunden", () => {
    const rows = [
      header,
      hourRow(" 0:00", 3, 1.5),
      hourRow(" 9:00", 4, 2),
      ["Alle (Zeit)", 7, 3.5, null, null, null],
    ];
    const p = parsePosHourly(rows);
    expect(p.rows.map((r) => r.hour)).toEqual([0, 9]);
    expect(allHourlyChecksOk(p)).toBe(true);
  });

  it("leere Anzahl/Wert-Zellen → 0", () => {
    const rows = [
      header,
      hourRow("5:00", null, null),
      hourRow("6:00", 2, 4),
      ["Alle (Zeit)", 2, 4, null, null, null],
    ];
    const p = parsePosHourly(rows);
    expect(p.rows[0]).toEqual({ hour: 5, anzahl: 0, wertCents: 0 });
    expect(allHourlyChecksOk(p)).toBe(true);
  });

  it("Anzahl>0 mit leerem Wert → wertCents 0", () => {
    const rows = [
      header,
      hourRow("7:00", 3, null),
      ["Alle (Zeit)", 3, 0, null, null, null],
    ];
    const p = parsePosHourly(rows);
    expect(p.rows[0]).toEqual({ hour: 7, anzahl: 3, wertCents: 0 });
    expect(allHourlyChecksOk(p)).toBe(true);
  });

  it("negative Werte werden durchgereicht", () => {
    const rows = [
      header,
      hourRow("2:00", -1, -3.5),
      hourRow("3:00", 5, 10),
      ["Alle (Zeit)", 4, 6.5, null, null, null],
    ];
    const p = parsePosHourly(rows);
    expect(p.rows[0]).toEqual({ hour: 2, anzahl: -1, wertCents: -350 });
    expect(allHourlyChecksOk(p)).toBe(true);
  });

  it("Füllzeile '-' wird übersprungen", () => {
    const rows = [
      header,
      ["-", null, null, null, null, null],
      hourRow("0:00", 1, 1),
      ["Alle (Zeit)", 1, 1, null, null, null],
    ];
    const p = parsePosHourly(rows);
    expect(p.rows.length).toBe(1);
  });

  it("Fußzeilen-Mismatch → checks nicht ok", () => {
    const rows = [
      header,
      hourRow("0:00", 1, 1),
      ["Alle (Zeit)", 2, 2, null, null, null],
    ];
    const p = parsePosHourly(rows);
    expect(allHourlyChecksOk(p)).toBe(false);
  });

  it("fehlende Fußzeile → footer-checks ok=false", () => {
    const rows = [header, hourRow("0:00", 1, 1)];
    const p = parsePosHourly(rows);
    expect(p.footer).toBeNull();
    expect(allHourlyChecksOk(p)).toBe(false);
  });

  it("doppelte Stunde → hour_valid=false", () => {
    const rows = [
      header,
      hourRow("5:00", 1, 1),
      hourRow("5:00", 2, 2),
      ["Alle (Zeit)", 3, 3, null, null, null],
    ];
    const p = parsePosHourly(rows);
    const chk = p.checks.find((c) => c.name === "hour_valid")!;
    expect(chk.ok).toBe(false);
  });

  it("%-Warnung greift bei > 0,15 pp Abweichung, sonst nicht", () => {
    // Zwei Stunden, jeweils 50%. Datei behauptet 60/40 → 10pp Abweichung.
    const rowsBad: (string | number | null)[][] = [
      header,
      ["10:00", 1, 5, 60, null, null],
      ["11:00", 1, 5, 40, null, null],
      ["Alle (Zeit)", 2, 10, 100, null, null],
    ];
    const bad = parsePosHourly(rowsBad);
    expect(bad.warnings.some((w) => w.includes("%-Wert"))).toBe(true);

    // Datei gibt korrekt gerundete 50/50 → keine %-Warnung.
    const rowsOk: (string | number | null)[][] = [
      header,
      ["10:00", 1, 5, 50, null, null],
      ["11:00", 1, 5, 50, null, null],
      ["Alle (Zeit)", 2, 10, 100, null, null],
    ];
    const ok = parsePosHourly(rowsOk);
    expect(ok.warnings.some((w) => w.includes("%-Wert"))).toBe(false);
  });
});