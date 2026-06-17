import { describe, it, expect } from "vitest";
import { isWithinGeofence } from "./geofence";

const FENCE = { latitude: 48.137, longitude: 11.575, radiusM: 100 };

describe("isWithinGeofence", () => {
  it("akzeptiert exakten Mittelpunkt", () => {
    const r = isWithinGeofence({
      fix: { latitude: 48.137, longitude: 11.575, accuracyM: 5 },
      fence: FENCE,
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.distanceM).toBeCloseTo(0, 3);
  });

  it("akzeptiert Punkt knapp innerhalb (50 m)", () => {
    const r = isWithinGeofence({
      fix: { latitude: 48.1374495, longitude: 11.575, accuracyM: 10 },
      fence: FENCE,
    });
    expect(r.ok).toBe(true);
  });

  it("blockt Punkt außerhalb (~220 m)", () => {
    const r = isWithinGeofence({
      fix: { latitude: 48.139, longitude: 11.575, accuracyM: 5 },
      fence: FENCE,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("outside");
    expect(r.distanceM).toBeGreaterThan(150);
  });

  it("blockt fehlenden Fix (NaN)", () => {
    const r = isWithinGeofence({
      fix: { latitude: Number.NaN, longitude: Number.NaN, accuracyM: Number.NaN },
      fence: FENCE,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_fix");
  });

  it("blockt accuracy > radius (auch wenn Mittelpunkt exakt)", () => {
    const r = isWithinGeofence({
      fix: { latitude: 48.137, longitude: 11.575, accuracyM: 150 },
      fence: FENCE,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("accuracy_too_low");
  });

  it("blockt Fence ohne Koordinaten", () => {
    const r = isWithinGeofence({
      fix: { latitude: 48.137, longitude: 11.575, accuracyM: 5 },
      fence: { latitude: Number.NaN, longitude: Number.NaN, radiusM: 100 },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_fix");
  });
});
