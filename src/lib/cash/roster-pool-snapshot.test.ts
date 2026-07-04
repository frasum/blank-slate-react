import { describe, it, expect } from "vitest";
import { buildRosterPoolSnapshot } from "./roster-pool-snapshot";

describe("buildRosterPoolSnapshot", () => {
  const defaults = {
    kitchen: { checkin: "15:00", checkout: "23:30" },
    service: { checkin: "16:00", checkout: "23:00" },
  };

  it("Küchen-Standardzeit erzeugt 8:30 h", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "a", area: "kitchen" }],
      defaultsByArea: defaults,
    });
    expect(res).toEqual([
      {
        staffId: "a",
        department: "kitchen",
        shiftStart: "15:00",
        shiftEnd: "23:30",
        hoursMinutes: 510,
      },
    ]);
  });

  it("Service-Standardzeit erzeugt 7 h", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "b", area: "service" }],
      defaultsByArea: defaults,
    });
    expect(res[0]).toMatchObject({
      staffId: "b",
      department: "service",
      shiftStart: "16:00",
      shiftEnd: null,
      hoursMinutes: 0,
    });
  });

  it("GL → null/null/0, unabhängig von Defaults", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "c", area: "gl" }],
      defaultsByArea: defaults,
    });
    expect(res).toEqual([
      { staffId: "c", department: "gl", shiftStart: null, shiftEnd: null, hoursMinutes: 0 },
    ]);
  });

  it("Priorität gl (Ausschluss) > kitchen > service pro Mitarbeiter, genau eine Zeile", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [
        { staffId: "x", area: "service" },
        { staffId: "x", area: "kitchen" },
        { staffId: "x", area: "gl" },
        { staffId: "y", area: "gl" },
        { staffId: "y", area: "service" },
      ],
      defaultsByArea: defaults,
    });
    const byStaff = new Map(res.map((r) => [r.staffId, r.department]));
    expect(res).toHaveLength(2);
    expect(byStaff.get("x")).toBe("gl");
    expect(byStaff.get("y")).toBe("gl");
  });

  it("TP-GL: service + gl am selben Tag ⇒ gl (nicht poolbeteiligt)", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [
        { staffId: "lam", area: "service" },
        { staffId: "lam", area: "gl" },
      ],
      defaultsByArea: defaults,
    });
    expect(res).toEqual([
      { staffId: "lam", department: "gl", shiftStart: null, shiftEnd: null, hoursMinutes: 0 },
    ]);
  });

  it("TP-GL: kitchen + gl am selben Tag ⇒ gl", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [
        { staffId: "k", area: "kitchen" },
        { staffId: "k", area: "gl" },
      ],
      defaultsByArea: defaults,
    });
    expect(res).toEqual([
      { staffId: "k", department: "gl", shiftStart: null, shiftEnd: null, hoursMinutes: 0 },
    ]);
  });

  it("fehlendes Küchen-Default → 0 Stunden, null/null", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "k", area: "kitchen" }],
      defaultsByArea: { service: { checkin: "16:00", checkout: "23:00" } },
    });
    expect(res[0]).toMatchObject({
      department: "kitchen",
      shiftStart: null,
      shiftEnd: null,
      hoursMinutes: 0,
    });
  });

  it("Service nur mit checkin (checkout null) → shiftStart, shiftEnd null, 0 min", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "s", area: "service" }],
      defaultsByArea: { service: { checkin: "16:00", checkout: null } },
    });
    expect(res[0]).toMatchObject({
      department: "service",
      shiftStart: "16:00",
      shiftEnd: null,
      hoursMinutes: 0,
    });
  });

  it("Service ohne checkin → null/null/0", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "s", area: "service" }],
      defaultsByArea: { service: { checkin: null, checkout: null } },
    });
    expect(res[0]).toMatchObject({
      department: "service",
      shiftStart: null,
      shiftEnd: null,
      hoursMinutes: 0,
    });
  });

  it("Kitchen mit checkin, checkout null → null/null/0", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "k", area: "kitchen" }],
      defaultsByArea: { kitchen: { checkin: "15:00", checkout: null } },
    });
    expect(res[0]).toMatchObject({
      department: "kitchen",
      shiftStart: null,
      shiftEnd: null,
      hoursMinutes: 0,
    });
  });

  it("toleriert 'HH:MM:SS'-Defaults aus Postgres time", () => {
    const res = buildRosterPoolSnapshot({
      rosterShifts: [{ staffId: "a", area: "kitchen" }],
      defaultsByArea: { kitchen: { checkin: "15:00:00", checkout: "23:30:00" } },
    });
    expect(res[0].hoursMinutes).toBe(510);
    expect(res[0].shiftStart).toBe("15:00");
  });
});
