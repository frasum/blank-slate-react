import { describe, expect, it } from "vitest";
import { BUNKER_HEADERS, parseBunkerCsv } from "./parse-bunker";

const HEADER = BUNKER_HEADERS.join(",");

describe("parseBunkerCsv", () => {
  it("hard-failed bei abweichendem Header", () => {
    expect(() => parseBunkerCsv("foo,bar\n1,2\n")).toThrow(/CSV-Header.*bunker/);
  });

  it("nutzt start_time/end_time mit shift_date wenn vorhanden", () => {
    const csv = `${HEADER}\nb1,st-1,Eva,r1,2026-01-15,planned,18:00:00,23:00:00,,,30,,5,note\n`;
    const rows = parseBunkerCsv(csv);
    expect(rows[0].startedAt).toBe("2026-01-15T17:00:00.000Z");
    expect(rows[0].endedAt).toBe("2026-01-15T22:00:00.000Z");
    expect(rows[0].breakMinutes).toBe(30);
    expect(rows[0].skipReason).toBeNull();
  });

  it("fällt auf clocked_*-Zeiten zurück", () => {
    const csv = `${HEADER}\nb2,st-2,Tom,r1,2026-01-15,clocked,,,2026-01-15T18:01:00Z,2026-01-15T23:05:00Z,0,,5,note\n`;
    const rows = parseBunkerCsv(csv);
    expect(rows[0].startedAt).toBe("2026-01-15T18:01:00.000Z");
    expect(rows[0].endedAt).toBe("2026-01-15T23:05:00.000Z");
  });

  it("kennzeichnet absence_type als Skip", () => {
    const csv = `${HEADER}\nb3,st-3,Eva,r1,2026-01-16,planned,,,,,0,sick,0,\n`;
    const rows = parseBunkerCsv(csv);
    expect(rows[0].skipReason).toBe("absence");
  });

  it("ohne start/clocked => absence", () => {
    const csv = `${HEADER}\nb4,st-4,Eva,r1,2026-01-17,planned,,,,,0,,0,\n`;
    const rows = parseBunkerCsv(csv);
    expect(rows[0].skipReason).toBe("absence");
  });
});