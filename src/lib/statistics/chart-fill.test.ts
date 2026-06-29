import { describe, expect, it } from "vitest";
import { fillDailyGaps, type DailyPoint } from "./chart-fill";

function pt(d: string, h = 0, t = 0): DailyPoint {
  return { businessDate: d, houseCents: h, takeawayCents: t, totalCents: h + t };
}

describe("fillDailyGaps", () => {
  it("returns [] for empty input", () => {
    expect(fillDailyGaps([])).toEqual([]);
  });

  it("returns unchanged sequence when there are no gaps", () => {
    const input = [pt("2026-06-06", 100), pt("2026-06-07", 200), pt("2026-06-08", 300)];
    const out = fillDailyGaps(input);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.businessDate)).toEqual(["2026-06-06", "2026-06-07", "2026-06-08"]);
    expect(out[1].houseCents).toBe(200);
  });

  it("fills inner gaps with zero days", () => {
    const input = [pt("2026-06-06", 100), pt("2026-06-09", 400)];
    const out = fillDailyGaps(input);
    expect(out).toHaveLength(4);
    expect(out.map((p) => p.businessDate)).toEqual([
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
    ]);
    expect(out[1]).toEqual({
      businessDate: "2026-06-07",
      houseCents: 0,
      takeawayCents: 0,
      totalCents: 0,
    });
    expect(out[2].totalCents).toBe(0);
  });

  it("keeps single day untouched", () => {
    const input = [pt("2026-06-15", 500)];
    expect(fillDailyGaps(input)).toEqual(input);
  });

  it("crosses month boundary correctly (UTC arithmetic)", () => {
    const input = [pt("2026-01-30", 100), pt("2026-02-02", 200)];
    const out = fillDailyGaps(input);
    expect(out.map((p) => p.businessDate)).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    expect(out[1].totalCents).toBe(0);
    expect(out[2].totalCents).toBe(0);
    expect(out[3].houseCents).toBe(200);
  });

  it("deduplicates with last-wins", () => {
    const input = [pt("2026-06-06", 100), pt("2026-06-06", 999)];
    const out = fillDailyGaps(input);
    expect(out).toHaveLength(1);
    expect(out[0].houseCents).toBe(999);
  });
});
