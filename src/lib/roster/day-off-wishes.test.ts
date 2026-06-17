import { describe, it, expect } from "vitest";
import { dayOffWishKey, sortWishesByDate } from "./day-off-wishes";

describe("dayOffWishKey", () => {
  it("formatiert Key als staffId|iso", () => {
    expect(dayOffWishKey("abc", "2026-06-17")).toBe("abc|2026-06-17");
  });
});

describe("sortWishesByDate", () => {
  it("sortiert aufsteigend nach wishDate ohne Mutation", () => {
    const input = [
      { wishDate: "2026-06-20", note: null },
      { wishDate: "2026-06-17", note: "a" },
      { wishDate: "2026-06-18", note: null },
    ];
    const snapshot = JSON.stringify(input);
    const out = sortWishesByDate(input);
    expect(out.map((r) => r.wishDate)).toEqual(["2026-06-17", "2026-06-18", "2026-06-20"]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("leere Liste → []", () => {
    expect(sortWishesByDate([])).toEqual([]);
  });
});
