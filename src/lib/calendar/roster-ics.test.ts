import { describe, it, expect } from "vitest";
import { buildRosterIcs, escapeIcsText, utcBasicFromIso } from "./roster-ics";
import { poolLocalTimeToIso } from "@/lib/cash/pool-time-writeback";

describe("escapeIcsText", () => {
  it("escaped Sonderzeichen nach RFC 5545", () => {
    expect(escapeIcsText("A, B; C\\ D\ne")).toBe("A\\, B\\; C\\\\ D\\ne");
  });
});

describe("utcBasicFromIso", () => {
  it("formatiert UTC-Basic korrekt", () => {
    expect(utcBasicFromIso("2026-07-01T13:04:05Z")).toBe("20260701T130405Z");
  });
});

describe("buildRosterIcs", () => {
  const now = new Date("2026-07-01T10:00:00Z");

  it("baut zeitliches Event mit korrektem UTC-DTSTART/DTEND", () => {
    // Küche 15:00–23:30 am 2026-07-01 (CEST = UTC+2)
    const startIso = poolLocalTimeToIso("2026-07-01", "15:00", 0);
    const endIso = poolLocalTimeToIso("2026-07-01", "23:30", 0);
    const ics = buildRosterIcs({
      calendarName: "COCO Dienstplan",
      now,
      events: [
        {
          uid: "roster-abc@coco",
          summary: "Küche · VS",
          location: "Wilmersdorf",
          allDay: false,
          startIso,
          endIso,
        },
      ],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:COCO Dienstplan");
    expect(ics).toContain("UID:roster-abc@coco");
    expect(ics).toContain("DTSTAMP:20260701T100000Z");
    expect(ics).toContain("DTSTART:20260701T130000Z");
    expect(ics).toContain("DTEND:20260701T213000Z");
    expect(ics).toContain("SUMMARY:Küche · VS");
    expect(ics).toContain("LOCATION:Wilmersdorf");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").length).toBeGreaterThan(5);
  });

  it("wickelt Mitternachts-Wrap (Ende am Folgetag) korrekt", () => {
    // 22:00 → 02:00 (Folgetag), CEST
    const startIso = poolLocalTimeToIso("2026-07-01", "22:00", 0);
    const endIso = poolLocalTimeToIso("2026-07-01", "02:00", 1);
    const ics = buildRosterIcs({
      calendarName: "x",
      now,
      events: [
        {
          uid: "roster-wrap@coco",
          summary: "Service",
          location: "L",
          allDay: false,
          startIso,
          endIso,
        },
      ],
    });
    expect(ics).toContain("DTSTART:20260701T200000Z");
    expect(ics).toContain("DTEND:20260702T000000Z");
  });

  it("Ganztags-Fallback nutzt VALUE=DATE ohne DTEND", () => {
    const ics = buildRosterIcs({
      calendarName: "x",
      now,
      events: [
        {
          uid: "roster-all@coco",
          summary: "GL",
          location: "L",
          allDay: true,
          date: "2026-07-01",
        },
      ],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260701");
    expect(ics).not.toContain("DTEND:");
  });

  it("escaped Komma und Semikolon im Titel", () => {
    const ics = buildRosterIcs({
      calendarName: "x",
      now,
      events: [
        {
          uid: "roster-esc@coco",
          summary: "A, B; C",
          location: "L",
          allDay: true,
          date: "2026-07-01",
        },
      ],
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C");
  });

  it("hält UID stabil (roster-<shiftId>@coco)", () => {
    const ics = buildRosterIcs({
      calendarName: "x",
      now,
      events: [
        {
          uid: "roster-shift-42@coco",
          summary: "s",
          location: "l",
          allDay: true,
          date: "2026-07-01",
        },
      ],
    });
    expect(ics).toContain("UID:roster-shift-42@coco");
  });
});