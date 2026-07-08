import { describe, it, expect } from "vitest";
import {
  actionBadges,
  buildBoard,
  groupRosterByLocation,
  isOverdue,
  resolveRosterTarget,
  ROSTER_LOOKAHEAD_HOUR,
} from "./board";
import type { Task } from "@/lib/aufgaben/types";

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    organization_id: "org",
    location_id: "loc",
    title: overrides.title ?? "T",
    description: null,
    category: "service",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? 0,
    sort_order: 0,
    due_at: overrides.due_at ?? null,
    assignee_staff_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    started_at: null,
    completed_at: null,
    archived_at: null,
    escalate_at: null,
    escalated_at: null,
    created_by_staff_id: "sys",
    ...overrides,
  } as Task;
}

describe("resolveRosterTarget", () => {
  it("Schwelle steht bei 20 Uhr", () => {
    expect(ROSTER_LOOKAHEAD_HOUR).toBe(20);
  });
  it("08:59 Berlin → heute", () => {
    // 08:59 in Berlin am 15. Juni 2026 (Sommerzeit UTC+2)
    const now = new Date("2026-06-15T06:59:00Z");
    const r = resolveRosterTarget(now);
    expect(r.iso).toBe("2026-06-15");
    expect(r.label).toBe("Heute im Dienst");
  });
  it("21:00 Berlin → morgen", () => {
    const now = new Date("2026-06-15T19:00:00Z"); // 21:00 Berlin
    const r = resolveRosterTarget(now);
    expect(r.iso).toBe("2026-06-16");
    expect(r.label).toBe("Morgen im Dienst");
  });
  it("20:00 Berlin → morgen (Schwellenwert inklusiv)", () => {
    const now = new Date("2026-06-15T18:00:00Z");
    expect(resolveRosterTarget(now).iso).toBe("2026-06-16");
  });
  it("Monatswechsel: 30. Juni 21:00 → 1. Juli", () => {
    const now = new Date("2026-06-30T19:00:00Z");
    expect(resolveRosterTarget(now).iso).toBe("2026-07-01");
  });
  it("Winter (UTC+1): 09:00 Berlin → heute", () => {
    const now = new Date("2026-01-15T08:00:00Z");
    expect(resolveRosterTarget(now).iso).toBe("2026-01-15");
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("null → nicht überfällig", () => expect(isOverdue(null, now)).toBe(false));
  it("Vergangenheit → true", () => expect(isOverdue("2026-06-14T00:00:00Z", now)).toBe(true));
  it("Zukunft → false", () => expect(isOverdue("2026-06-16T00:00:00Z", now)).toBe(false));
});

describe("buildBoard", () => {
  it("teilt nach Status auf, nur open/in_progress", () => {
    const rows = [
      task({ status: "open", title: "A" }),
      task({ status: "in_progress", title: "B" }),
      task({ status: "done", title: "C" }),
      task({ status: "cancelled", title: "D" }),
    ];
    const cols = buildBoard(rows, 10);
    expect(cols.map((c) => c.status)).toEqual(["open", "in_progress"]);
    expect(cols[0].visible.map((t) => t.title)).toEqual(["A"]);
    expect(cols[1].visible.map((t) => t.title)).toEqual(["B"]);
  });
  it("overflow zählt den Rest", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      task({ status: "open", title: `T${i}`, priority: 0 }),
    );
    const cols = buildBoard(rows, 3);
    expect(cols[0].visible).toHaveLength(3);
    expect(cols[0].overflow).toBe(5);
  });
  it("Priorität DESC, dann due ASC, NULL zuletzt", () => {
    const rows = [
      task({ title: "low", priority: 1, due_at: "2026-06-20T00:00:00Z" }),
      task({ title: "urgent-early", priority: 3, due_at: "2026-06-15T00:00:00Z" }),
      task({ title: "urgent-null", priority: 3, due_at: null }),
      task({ title: "urgent-late", priority: 3, due_at: "2026-06-16T00:00:00Z" }),
    ];
    const [openCol] = buildBoard(rows, 10);
    expect(openCol.visible.map((t) => t.title)).toEqual([
      "urgent-early",
      "urgent-late",
      "urgent-null",
      "low",
    ]);
  });
});

describe("actionBadges", () => {
  it("nur >0 Zähler, Bestellungen zuerst und emphasize", () => {
    const b = actionBadges({ openLeaves: 0, openSwaps: 1, futureWishes: 0, unsentOrders: 3 });
    expect(b.map((x) => x.key)).toEqual(["orders", "swaps"]);
    expect(b[0].emphasize).toBe(true);
    expect(b[1].emphasize).toBe(false);
  });
  it("alles 0 → leer", () => {
    expect(actionBadges({ openLeaves: 0, openSwaps: 0, futureWishes: 0, unsentOrders: 0 })).toEqual([]);
  });
  it("Bestellungen 0 werden nicht angezeigt", () => {
    const b = actionBadges({ openLeaves: 2, openSwaps: 0, futureWishes: 1, unsentOrders: 0 });
    expect(b.map((x) => x.key)).toEqual(["leaves", "wishes"]);
  });
});

describe("groupRosterByLocation", () => {
  const staffNames = new Map([
    ["s1", "Anna"],
    ["s2", "Ben"],
    ["s3", "Clara"],
    ["s4", "Dora"],
  ]);
  const locationNames = new Map([
    ["l1", "Coco Mitte"],
    ["l2", "Coco Süd"],
  ]);
  it("gruppiert nach Standort und Bereich, Abwesende raus", () => {
    const shifts = [
      { staffId: "s1", locationId: "l1", area: "kitchen", servicePeriod: "abend" },
      { staffId: "s2", locationId: "l1", area: "service", servicePeriod: "abend" },
      { staffId: "s3", locationId: "l1", area: "service", servicePeriod: "abend" },
      { staffId: "s4", locationId: "l2", area: "kitchen", servicePeriod: "abend" },
    ];
    const blocks = groupRosterByLocation({
      shifts,
      staffNames,
      locationNames,
      absentStaffIds: new Set(["s3"]),
    });
    expect(blocks[0].locationName).toBe("Coco Mitte");
    expect(blocks[0].total).toBe(2); // s3 abwesend, s1+s2 zählen
    expect(blocks[0].groups[0].areaKey).toBe("kitchen");
    expect(blocks[0].groups[0].names).toEqual(["Anna"]);
    expect(blocks[0].groups[1].areaKey).toBe("service");
    expect(blocks[0].groups[1].names).toEqual(["Ben"]);
  });
  it("mehrere Fenster → separat gruppieren", () => {
    const shifts = [
      { staffId: "s1", locationId: "l1", area: "kitchen", servicePeriod: "frueh" },
      { staffId: "s2", locationId: "l1", area: "kitchen", servicePeriod: "abend" },
    ];
    const [b] = groupRosterByLocation({
      shifts,
      staffNames,
      locationNames,
      absentStaffIds: new Set(),
    });
    expect(b.groups).toHaveLength(2);
    expect(b.groups[0].areaLabel).toContain("Früh");
    expect(b.groups[1].areaLabel).toContain("Abend");
  });
  it("nur ein Fenster → kein Fenster-Label", () => {
    const shifts = [
      { staffId: "s1", locationId: "l1", area: "kitchen", servicePeriod: "abend" },
    ];
    const [b] = groupRosterByLocation({
      shifts,
      staffNames,
      locationNames,
      absentStaffIds: new Set(),
    });
    expect(b.groups[0].areaLabel).toBe("Küche");
  });
});