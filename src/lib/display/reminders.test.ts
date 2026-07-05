import { describe, it, expect } from "vitest";
import {
  activeReminders,
  isoWeekday,
  isReminderActive,
  remindersForBusinessDate,
  sortReminders,
  type Reminder,
} from "./reminders";

function r(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Test",
    emoji: "🗑️",
    color: "braun",
    weekday: 1, // Dienstag
    intervalWeeks: 1,
    anchorDate: null,
    fromTime: "20:00",
    untilTime: "01:00",
    sortOrder: 0,
    ...overrides,
  };
}

describe("isoWeekday", () => {
  it("Montag=0 … Sonntag=6", () => {
    expect(isoWeekday("2026-07-06")).toBe(0); // Montag
    expect(isoWeekday("2026-07-07")).toBe(1); // Dienstag
    expect(isoWeekday("2026-07-12")).toBe(6); // Sonntag
  });
});

describe("isReminderActive", () => {
  const businessDate = "2026-07-07"; // Dienstag

  it("richtiger Wochentag + nach fromTime => aktiv", () => {
    expect(isReminderActive(r(), { date: "2026-07-07", hour: 20, minute: 5 }, businessDate)).toBe(
      true,
    );
  });

  it("richtiger Wochentag, aber vor fromTime => nicht aktiv", () => {
    expect(isReminderActive(r(), { date: "2026-07-07", hour: 19, minute: 59 }, businessDate)).toBe(
      false,
    );
  });

  it("falscher Wochentag => nicht aktiv", () => {
    expect(
      isReminderActive(
        r({ weekday: 2 }),
        { date: "2026-07-07", hour: 22, minute: 0 },
        businessDate,
      ),
    ).toBe(false);
  });

  it("nach Mitternacht desselben Geschäftstags weiterhin aktiv", () => {
    // Geschäftstag = 2026-07-07 (Di), Kalenderzeit = 2026-07-08 00:30 Berlin
    expect(isReminderActive(r(), { date: "2026-07-08", hour: 0, minute: 30 }, businessDate)).toBe(
      true,
    );
  });

  it("DP1b: 20:00–01:00 → 23:59 aktiv", () => {
    expect(isReminderActive(r(), { date: "2026-07-07", hour: 23, minute: 59 }, businessDate)).toBe(
      true,
    );
  });

  it("DP1b: 20:00–01:00 → 01:30 (nach Ende) inaktiv", () => {
    expect(isReminderActive(r(), { date: "2026-07-08", hour: 1, minute: 30 }, businessDate)).toBe(
      false,
    );
  });

  it("DP1b: gleicher Abend 18:00–22:00 → 22:30 inaktiv", () => {
    const rem = r({ fromTime: "18:00", untilTime: "22:00" });
    expect(isReminderActive(rem, { date: "2026-07-07", hour: 22, minute: 30 }, businessDate)).toBe(
      false,
    );
    expect(isReminderActive(rem, { date: "2026-07-07", hour: 21, minute: 59 }, businessDate)).toBe(
      true,
    );
  });

  it("14-tägig: gerade Woche zum Anker aktiv, dazwischenliegende nicht", () => {
    const anchor = "2026-07-07"; // Dienstag
    const biweekly = r({ intervalWeeks: 2, anchorDate: anchor });
    // Anker selbst
    expect(
      isReminderActive(biweekly, { date: "2026-07-07", hour: 20, minute: 1 }, "2026-07-07"),
    ).toBe(true);
    // +14 Tage: aktiv
    expect(
      isReminderActive(biweekly, { date: "2026-07-21", hour: 20, minute: 1 }, "2026-07-21"),
    ).toBe(true);
    // +7 Tage: falsche Parität
    expect(
      isReminderActive(biweekly, { date: "2026-07-14", hour: 20, minute: 1 }, "2026-07-14"),
    ).toBe(false);
  });

  it("14-tägig: Anker in der Zukunft funktioniert ebenfalls per Modulo", () => {
    const biweekly = r({ intervalWeeks: 2, anchorDate: "2027-01-05" }); // ferner Dienstag
    // 14 Tage vor dem Anker: aktiv
    expect(
      isReminderActive(biweekly, { date: "2026-12-22", hour: 20, minute: 1 }, "2026-12-22"),
    ).toBe(true);
    // 7 Tage vor dem Anker: falsche Parität
    expect(
      isReminderActive(biweekly, { date: "2026-12-29", hour: 20, minute: 1 }, "2026-12-29"),
    ).toBe(false);
  });

  it("14-tägig ohne Anker => nicht aktiv", () => {
    expect(
      isReminderActive(
        r({ intervalWeeks: 2, anchorDate: null }),
        { date: "2026-07-07", hour: 22, minute: 0 },
        "2026-07-07",
      ),
    ).toBe(false);
  });
});

describe("remindersForBusinessDate", () => {
  it("filtert auf Wochentag und Parität, ohne Uhrzeit-Check", () => {
    const list = [
      r({ id: "a", weekday: 1 }),
      r({ id: "b", weekday: 2 }),
      r({ id: "c", weekday: 1, intervalWeeks: 2, anchorDate: "2026-07-14" }), // +7 → raus
      r({ id: "d", weekday: 1, intervalWeeks: 2, anchorDate: "2026-07-07" }),
    ];
    const got = remindersForBusinessDate(list, "2026-07-07")
      .map((x) => x.id)
      .sort();
    expect(got).toEqual(["a", "d"]);
  });
});

describe("sortReminders / activeReminders", () => {
  it("sortiert nach sort_order, dann fromTime", () => {
    const list = [
      r({ id: "b", sortOrder: 10, fromTime: "18:00" }),
      r({ id: "a", sortOrder: 5, fromTime: "22:00" }),
      r({ id: "c", sortOrder: 10, fromTime: "07:00" }),
    ];
    expect(sortReminders(list).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("activeReminders lässt inaktive weg", () => {
    const list = [r({ id: "on" }), r({ id: "early", fromTime: "23:59" })];
    const got = activeReminders(list, { date: "2026-07-07", hour: 20, minute: 30 }, "2026-07-07");
    expect(got.map((x) => x.id)).toEqual(["on"]);
  });
});
