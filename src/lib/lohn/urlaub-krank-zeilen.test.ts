import { describe, it, expect } from "vitest";
import { buildUrlaubKrankZeilen } from "./urlaub-krank-zeilen";

describe("buildUrlaubKrankZeilen", () => {
  it("erzeugt 2 Zeilen für Urlaub (Basis + Zuschlag)", () => {
    const z = buildUrlaubKrankZeilen({
      urlaubTage: 21,
      krankTage: 0,
      sollHoursPerDay: 8,
      hourlyRateCents: 1500,
      sfnTagCent: 2895,
    });
    expect(z).toHaveLength(2);
    expect(z[0].betragCent).toBe(252000);
    expect(z[0].stunden).toBe(168);
    expect(z[0].satzCent).toBe(1500);
    expect(z[1].betragCent).toBe(60795);
    expect(z.every((x) => x.kategorie === "zeitlohn")).toBe(true);
  });

  it("erzeugt 2 Zeilen für Krank (Basis + Zuschlag)", () => {
    const z = buildUrlaubKrankZeilen({
      urlaubTage: 0,
      krankTage: 5,
      sollHoursPerDay: 8,
      hourlyRateCents: 1400,
      sfnTagCent: 887,
    });
    expect(z).toHaveLength(2);
    expect(z[0].betragCent).toBe(56000);
    expect(z[0].stunden).toBe(40);
    expect(z[1].betragCent).toBe(4435);
    expect(z.every((x) => x.kategorie === "zeitlohn")).toBe(true);
  });

  it("erzeugt 4 Zeilen wenn beide >0", () => {
    const z = buildUrlaubKrankZeilen({
      urlaubTage: 2,
      krankTage: 3,
      sollHoursPerDay: 8,
      hourlyRateCents: 1500,
      sfnTagCent: 1000,
    });
    expect(z).toHaveLength(4);
    expect(z.every((x) => x.kategorie === "zeitlohn")).toBe(true);
  });

  it("erzeugt leeres Array wenn beide 0", () => {
    const z = buildUrlaubKrankZeilen({
      urlaubTage: 0,
      krankTage: 0,
      sollHoursPerDay: 8,
      hourlyRateCents: 1500,
      sfnTagCent: 1000,
    });
    expect(z).toEqual([]);
  });
});
