import { describe, expect, it } from "vitest";
import { computePresets, toIsoDate } from "./period-resolver";

describe("computePresets", () => {
  const ref = new Date(Date.UTC(2026, 6, 7)); // 2026-07-07 (Dienstag)

  it("liefert alle Standardkeys mit ISO-Datum", () => {
    const p = computePresets(ref);
    const keys = p.map((x) => x.key);
    expect(keys).toEqual([
      "heute",
      "gestern",
      "diese_woche",
      "letzte_woche",
      "letzte_7_tage",
      "letzte_30_tage",
      "diesen_monat",
      "letzter_monat",
      "dieses_jahr",
    ]);
    expect(p.find((x) => x.key === "heute")).toMatchObject({
      from: "2026-07-07",
      to: "2026-07-07",
    });
  });

  it("letzter_monat = 01.–30.06.2026", () => {
    const lm = computePresets(ref).find((p) => p.key === "letzter_monat")!;
    expect(lm.from).toBe("2026-06-01");
    expect(lm.to).toBe("2026-06-30");
  });

  it("letzte_woche = Mo 29.06.–So 05.07.2026", () => {
    const lw = computePresets(ref).find((p) => p.key === "letzte_woche")!;
    expect(lw.from).toBe("2026-06-29");
    expect(lw.to).toBe("2026-07-05");
  });

  it("Jahreswechsel: Januar → Dezember Vorjahr", () => {
    const jan1 = new Date(Date.UTC(2027, 0, 1));
    const lm = computePresets(jan1).find((p) => p.key === "letzter_monat")!;
    expect(lm.from).toBe("2026-12-01");
    expect(lm.to).toBe("2026-12-31");
  });

  it("Sonntag → letzte_woche endet am Vortag", () => {
    const sun = new Date(Date.UTC(2026, 6, 5)); // 05.07.2026 = So
    const p = computePresets(sun);
    expect(p.find((x) => x.key === "letzte_woche")!.to).toBe("2026-06-28");
  });

  it("toIsoDate ist UTC-basiert", () => {
    expect(toIsoDate(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
  });
});
