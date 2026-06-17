import { describe, expect, it } from "vitest";
import { pickSingleLocation } from "./resolve-location";

describe("pickSingleLocation", () => {
  it("liefert null bei leerer Liste", () => {
    expect(pickSingleLocation([])).toBeNull();
  });

  it("liefert den einzigen Standort", () => {
    expect(pickSingleLocation([{ location_id: "A" }])).toBe("A");
  });

  it("liefert den Standort bei mehreren Bereichen am selben Standort", () => {
    expect(pickSingleLocation([{ location_id: "A" }, { location_id: "A" }])).toBe("A");
  });

  it("liefert null bei zwei verschiedenen Standorten", () => {
    expect(pickSingleLocation([{ location_id: "A" }, { location_id: "B" }])).toBeNull();
  });

  it("liefert null wenn ein weiterer Standort hinzukommt", () => {
    expect(
      pickSingleLocation([{ location_id: "A" }, { location_id: "A" }, { location_id: "B" }]),
    ).toBeNull();
  });
});