import { describe, it, expect } from "vitest";
import { zeitlohnKategorie } from "./lohn-rechner.functions";

describe("zeitlohnKategorie", () => {
  it("Minijob → aushilfe_paust", () => {
    expect(zeitlohnKategorie("minijob")).toBe("aushilfe_paust");
  });
  it("Normal → zeitlohn", () => {
    expect(zeitlohnKategorie("normal")).toBe("zeitlohn");
  });
});