import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { expectMaybe, expectOk, expectVoid } from "./expect-ok";

describe("expect-ok helpers", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  describe("expectOk", () => {
    it("gibt data typsicher zurück", () => {
      const out = expectOk<{ id: string }>({ data: { id: "x" }, error: null }, "ctx");
      expect(out).toEqual({ id: "x" });
    });
    it("wirft mit Kontext bei error", () => {
      expect(() => expectOk({ data: null, error: { message: "boom" } }, "loadStaff")).toThrow(
        /\[loadStaff\] Supabase: boom/,
      );
    });
    it("wirft, wenn data null ist", () => {
      expect(() => expectOk({ data: null, error: null }, "ctx")).toThrow(/kein Ergebnis/);
    });
  });

  describe("expectMaybe", () => {
    it("gibt data zurück", () => {
      expect(expectMaybe({ data: { id: "x" }, error: null }, "ctx")).toEqual({ id: "x" });
    });
    it("erlaubt null als Ergebnis", () => {
      expect(expectMaybe({ data: null, error: null }, "ctx")).toBeNull();
    });
    it("erlaubt PGRST116 (nicht gefunden)", () => {
      expect(
        expectMaybe({ data: null, error: { message: "no rows", code: "PGRST116" } }, "ctx"),
      ).toBeNull();
    });
    it("wirft bei echtem Fehler mit Kontext", () => {
      expect(() =>
        expectMaybe({ data: null, error: { message: "boom", code: "42P01" } }, "loadStaff"),
      ).toThrow(/\[loadStaff\] Supabase: boom/);
    });
  });

  describe("expectVoid", () => {
    it("bleibt bei error=null still", () => {
      expect(() => expectVoid({ error: null }, "ctx")).not.toThrow();
    });
    it("wirft mit Kontext bei error", () => {
      expect(() => expectVoid({ error: { message: "boom" } }, "updStaff")).toThrow(
        /\[updStaff\] Supabase: boom/,
      );
    });
  });
});
