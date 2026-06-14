import { describe, it, expect } from "vitest";
import { serviceMarker } from "./service-marker";

describe("serviceMarker", () => {
  it("SERVICE → X", () => {
    expect(serviceMarker("SERVICE")).toBe("X");
  });
  it("GL → GL", () => {
    expect(serviceMarker("GL")).toBe("GL");
  });
  it("BAR → B", () => {
    expect(serviceMarker("BAR")).toBe("B");
  });
  it("19 Uhr → 19h", () => {
    expect(serviceMarker("19 Uhr")).toBe("19h");
  });
  it("Hausmeister → H", () => {
    expect(serviceMarker("Hausmeister")).toBe("H");
  });
  it("null → X", () => {
    expect(serviceMarker(null)).toBe("X");
  });
  it("unknown → X (default)", () => {
    expect(serviceMarker("Foobar")).toBe("X");
  });
});