import { describe, expect, it } from "vitest";
import { parseTagesabrechnungCsv, TAGESABRECHNUNG_HEADERS } from "./parse-tagesabrechnung";

const HEADER = TAGESABRECHNUNG_HEADERS.join(",");

describe("parseTagesabrechnungCsv", () => {
  it("hard-failed bei abweichendem Header", () => {
    expect(() => parseTagesabrechnungCsv("foo,bar\n1,2\n")).toThrow(/CSV-Header.*tagesabrechnung/);
  });

  it("normalisiert eine reguläre Schicht (Wandzeit → UTC, Berlin)", () => {
    // 2026-01-15 ist Donnerstag, MEZ (UTC+1). 17:00 Berlin = 16:00Z.
    const csv = `${HEADER}\nshift-1,emp-1,Anna,Anni,2026-01-15,Service,17:00:00,21:30:00,,false,4.5,1.5,0,0,0\n`;
    const rows = parseTagesabrechnungCsv(csv);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.altId).toBe("shift-1");
    expect(r.altEmployeeId).toBe("emp-1");
    expect(r.altEmployeeName).toBe("Anna");
    expect(r.shiftDate).toBe("2026-01-15");
    expect(r.startedAt).toBe("2026-01-15T16:00:00.000Z");
    expect(r.endedAt).toBe("2026-01-15T20:30:00.000Z");
    expect(r.breakMinutes).toBe(0);
    expect(r.skipReason).toBeNull();
    expect(r.altTotals).toEqual({
      totalHours: 4.5,
      eveningHours: 1.5,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    });
  });

  it("schiebt Übernacht-Schicht auf Folgetag", () => {
    const csv = `${HEADER}\ns2,e1,Max,,2026-01-15,Bar,21:00:00,02:00:00,,false,5,3,2,2,0\n`;
    const rows = parseTagesabrechnungCsv(csv);
    expect(rows[0].startedAt).toBe("2026-01-15T20:00:00.000Z");
    expect(rows[0].endedAt).toBe("2026-01-16T01:00:00.000Z");
  });

  it("kennzeichnet absence_type als Skip", () => {
    const csv = `${HEADER}\ns3,e1,Anna,,2026-01-16,Service,,,vacation,false,0,0,0,0,0\n`;
    const rows = parseTagesabrechnungCsv(csv);
    expect(rows[0].skipReason).toBe("absence");
    expect(rows[0].startedAt).toBeNull();
  });

  it("kennzeichnet ungültige Zeit als invalid_time", () => {
    const csv = `${HEADER}\ns4,e1,Anna,,2026-01-17,Service,25:00:00,02:00:00,,false,0,0,0,0,0\n`;
    const rows = parseTagesabrechnungCsv(csv);
    expect(rows[0].skipReason).toBe("invalid_time");
  });
});
