import { describe, expect, it } from "vitest";
import { RELOAD_COOLDOWN_MS, shouldReload } from "./version-reload";

describe("shouldReload", () => {
  const now = 1_000_000_000;

  it("kein Reload, wenn noch keine Version bekannt (erster Fetch)", () => {
    expect(shouldReload(null, "v1", null, now)).toBe(false);
  });

  it("kein Reload bei gleicher Version", () => {
    expect(shouldReload("v1", "v1", null, now)).toBe(false);
  });

  it("Reload bei neuer Version ohne vorherigen Reload", () => {
    expect(shouldReload("v1", "v2", null, now)).toBe(true);
  });

  it("kein Reload, wenn letzter Reload < 5 min her", () => {
    expect(shouldReload("v1", "v2", now - (RELOAD_COOLDOWN_MS - 1), now)).toBe(false);
  });

  it("Reload, wenn letzter Reload ≥ 5 min her", () => {
    expect(shouldReload("v1", "v2", now - RELOAD_COOLDOWN_MS, now)).toBe(true);
  });

  it("kein Reload, wenn incoming leer/undefined", () => {
    expect(shouldReload("v1", null, null, now)).toBe(false);
    expect(shouldReload("v1", undefined, null, now)).toBe(false);
    expect(shouldReload("v1", "", null, now)).toBe(false);
  });
});