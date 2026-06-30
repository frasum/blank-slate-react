import { describe, it, expect } from "vitest";
import { allowedLocations, canEditScope, type RosterScope } from "./scope-util";

const L1 = "11111111-1111-1111-1111-111111111111";
const L2 = "22222222-2222-2222-2222-222222222222";
const L3 = "33333333-3333-3333-3333-333333333333";
const locs = [{ id: L1 }, { id: L2 }, { id: L3 }];

describe("allowedLocations", () => {
  it("filtert auf Standorte aus den Scopes", () => {
    const scopes: RosterScope[] = [
      { locationId: L1, area: "kitchen" },
      { locationId: L3, area: "service" },
    ];
    expect(allowedLocations(locs, scopes).map((l) => l.id)).toEqual([L1, L3]);
  });
  it("leere Scopes → leere Liste", () => {
    expect(allowedLocations(locs, [])).toEqual([]);
  });
  it("Manager-Fall (alle Kombis) → alle Standorte", () => {
    const scopes: RosterScope[] = locs.flatMap((l) => [
      { locationId: l.id, area: "kitchen" as const },
      { locationId: l.id, area: "service" as const },
    ]);
    expect(allowedLocations(locs, scopes).map((l) => l.id)).toEqual([L1, L2, L3]);
  });
});

describe("canEditScope", () => {
  const scopes: RosterScope[] = [{ locationId: L1, area: "kitchen" }];
  it("(L1,kitchen) erlaubt → true", () => {
    expect(canEditScope(scopes, L1, "kitchen")).toBe(true);
  });
  it("(L1,service) → false", () => {
    expect(canEditScope(scopes, L1, "service")).toBe(false);
  });
  it("(L2,kitchen) → false", () => {
    expect(canEditScope(scopes, L2, "kitchen")).toBe(false);
  });
  it("locationId=null → false", () => {
    expect(canEditScope(scopes, null, "kitchen")).toBe(false);
  });
});