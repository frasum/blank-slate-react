import { describe, it, expect } from "vitest";
import { assertCashWritable, CashLockedError, isBelowWaterline } from "./cash-lock";

describe("isBelowWaterline", () => {
  it("null waterline = nicht gesperrt", () => {
    expect(isBelowWaterline("2026-06-13", null)).toBe(false);
  });
  it("genau am Datum = gesperrt (inklusive)", () => {
    expect(isBelowWaterline("2026-06-13", "2026-06-13")).toBe(true);
  });
  it("davor = gesperrt", () => {
    expect(isBelowWaterline("2026-06-12", "2026-06-13")).toBe(true);
  });
  it("danach = nicht gesperrt", () => {
    expect(isBelowWaterline("2026-06-14", "2026-06-13")).toBe(false);
  });
});

describe("assertCashWritable", () => {
  const base = {
    businessDate: "2026-06-13",
    sessionStatus: "open" as const,
    sessionLockedAt: null,
    cashLockedThroughDate: null,
  };

  it("open + keine Wasserlinie = ok", () => {
    expect(() => assertCashWritable(base)).not.toThrow();
  });

  it("finalized = ok (Korrektur erlaubt)", () => {
    expect(() => assertCashWritable({ ...base, sessionStatus: "finalized" })).not.toThrow();
  });

  it("locked-Status wirft", () => {
    expect(() => assertCashWritable({ ...base, sessionStatus: "locked" })).toThrow(CashLockedError);
  });

  it("sessionLockedAt gesetzt wirft (auch wenn Status open)", () => {
    expect(() => assertCashWritable({ ...base, sessionLockedAt: "2026-06-13T20:00:00Z" })).toThrow(
      CashLockedError,
    );
  });

  it("unter Wasserlinie wirft", () => {
    expect(() => assertCashWritable({ ...base, cashLockedThroughDate: "2026-06-13" })).toThrow(
      CashLockedError,
    );
  });

  it("genau am Wasserlinien-Datum wirft", () => {
    expect(() =>
      assertCashWritable({
        ...base,
        businessDate: "2026-06-13",
        cashLockedThroughDate: "2026-06-13",
      }),
    ).toThrow(CashLockedError);
  });

  it("über Wasserlinie = ok", () => {
    expect(() =>
      assertCashWritable({
        ...base,
        businessDate: "2026-06-14",
        cashLockedThroughDate: "2026-06-13",
      }),
    ).not.toThrow();
  });

  it("finalized + unter Wasserlinie wirft (Wasserlinie hat Vorrang)", () => {
    expect(() =>
      assertCashWritable({
        ...base,
        sessionStatus: "finalized",
        cashLockedThroughDate: "2026-06-13",
      }),
    ).toThrow(CashLockedError);
  });

  it("Fehler-Reason ist diskriminiert", () => {
    try {
      assertCashWritable({ ...base, sessionStatus: "locked" });
    } catch (e) {
      expect(e).toBeInstanceOf(CashLockedError);
      expect((e as CashLockedError).reason).toBe("session_locked");
    }
    try {
      assertCashWritable({ ...base, cashLockedThroughDate: "2026-06-13" });
    } catch (e) {
      expect((e as CashLockedError).reason).toBe("below_waterline");
    }
  });

  it("blockIfFinalized=true wirft auf finalized", () => {
    try {
      assertCashWritable({ ...base, sessionStatus: "finalized", blockIfFinalized: true });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CashLockedError);
      expect((e as CashLockedError).reason).toBe("session_finalized");
    }
  });

  it("blockIfFinalized=true lässt open weiterhin durch", () => {
    expect(() =>
      assertCashWritable({ ...base, sessionStatus: "open", blockIfFinalized: true }),
    ).not.toThrow();
  });

  it("blockIfFinalized=true: locked-Reason hat Vorrang vor finalized", () => {
    try {
      assertCashWritable({ ...base, sessionStatus: "locked", blockIfFinalized: true });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CashLockedError).reason).toBe("session_locked");
    }
  });
});
