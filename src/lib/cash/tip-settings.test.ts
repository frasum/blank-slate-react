import { describe, expect, it } from "vitest";
import { mergeTipSettings } from "./tip-settings";

const org = { kitchenTipRate: 0.02, tipPoolMinHours: 2.5, kitchenManualOnly: false };

describe("mergeTipSettings — COALESCE-Vererbung", () => {
  it("kein Standort → alle Org-Standards, servicePool default an", () => {
    const r = mergeTipSettings({ org, location: null });
    expect(r).toEqual({
      servicePoolEnabled: true,
      kitchenTipRate: 0.02,
      tipPoolMinHours: 2.5,
      kitchenManualOnly: false,
    });
  });

  it("Overrides alle NULL → Org-Standards, aber servicePoolEnabled aus DB", () => {
    const r = mergeTipSettings({
      org,
      location: {
        tipServicePoolEnabled: false,
        kitchenTipRateOverride: null,
        tipPoolMinHoursOverride: null,
        kitchenManualOnlyOverride: null,
      },
    });
    expect(r).toEqual({
      servicePoolEnabled: false,
      kitchenTipRate: 0.02,
      tipPoolMinHours: 2.5,
      kitchenManualOnly: false,
    });
  });

  it("Overrides gesetzt → Overrides gewinnen", () => {
    const r = mergeTipSettings({
      org,
      location: {
        tipServicePoolEnabled: true,
        kitchenTipRateOverride: 0.03,
        tipPoolMinHoursOverride: 4,
        kitchenManualOnlyOverride: true,
      },
    });
    expect(r).toEqual({
      servicePoolEnabled: true,
      kitchenTipRate: 0.03,
      tipPoolMinHours: 4,
      kitchenManualOnly: true,
    });
  });

  it("false-Overrides überschreiben nicht per Wahrheitswert (nur NULL fällt zurück)", () => {
    const r = mergeTipSettings({
      org: { ...org, kitchenManualOnly: true },
      location: {
        tipServicePoolEnabled: true,
        kitchenTipRateOverride: 0,
        tipPoolMinHoursOverride: 0,
        kitchenManualOnlyOverride: false,
      },
    });
    expect(r.kitchenTipRate).toBe(0);
    expect(r.tipPoolMinHours).toBe(0);
    expect(r.kitchenManualOnly).toBe(false);
  });
});