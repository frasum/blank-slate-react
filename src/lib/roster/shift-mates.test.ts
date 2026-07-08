import { describe, expect, it } from "vitest";
import {
  formatShiftMatesLine,
  MATES_MAX_PER_AREA,
  shiftMatesKey,
  type ShiftMate,
} from "./shift-mates";

function mate(name: string, area: ShiftMate["area"] = "service"): ShiftMate {
  return { staffId: name, displayName: name, area, skillName: null, status: "planned" };
}

describe("formatShiftMatesLine", () => {
  it("beide Bereiche", () => {
    const line = formatShiftMatesLine([mate("Anna", "kitchen"), mate("Ben", "service")]);
    expect(line).toBe("Küche: Anna · Service: Ben");
  });

  it("nur ein Bereich", () => {
    expect(formatShiftMatesLine([mate("Anna", "kitchen"), mate("Bea", "kitchen")])).toBe(
      "Küche: Anna Bea",
    );
    expect(formatShiftMatesLine([mate("C", "service")])).toBe("Service: C");
  });

  it("leere Liste ⇒ leerer String", () => {
    expect(formatShiftMatesLine([])).toBe("");
  });

  it("Kappung genau an der Grenze zeigt kein +N", () => {
    const names = Array.from({ length: MATES_MAX_PER_AREA }, (_, i) => `N${i + 1}`);
    const line = formatShiftMatesLine(names.map((n) => mate(n, "service")));
    expect(line).toBe(`Service: ${names.join(" ")}`);
    expect(line).not.toContain("+");
  });

  it("Kappung darüber zeigt +N", () => {
    const names = Array.from({ length: MATES_MAX_PER_AREA + 3 }, (_, i) => `N${i + 1}`);
    const line = formatShiftMatesLine(names.map((n) => mate(n, "kitchen")));
    expect(line).toBe(`Küche: ${names.slice(0, MATES_MAX_PER_AREA).join(" ")} +3`);
  });

  it("ignoriert gl / unbekannte Bereiche", () => {
    const mixed = [
      mate("Anna", "kitchen"),
      { ...mate("GLGuy"), area: "gl" as unknown as ShiftMate["area"] },
    ];
    expect(formatShiftMatesLine(mixed)).toBe("Küche: Anna");
  });
});

describe("shiftMatesKey", () => {
  it("baut deterministischen Schlüssel", () => {
    expect(shiftMatesKey("2026-07-08", "loc-1")).toBe("2026-07-08|loc-1");
  });
});