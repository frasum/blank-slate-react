// WP1 — Tests für die Editor-Zustandslogik.
// (a) leere Zelle + Blur/Enter ohne Eingabe → close (kein Create)
// (b) leere Zelle + nur from → error (kein Create)
// (c) bestehender Eintrag + beide Felder geleert → delete
// (d) bestehender Eintrag unverändert → noop (kein Update)

import { describe, it, expect } from "vitest";
import { resolveEditorAction, parseHHMM } from "./weekly-editor-actions";

describe("resolveEditorAction", () => {
  it("(a) leere Zelle + Blur ohne Eingabe → close, kein Create", () => {
    const act = resolveEditorAction({
      from: "",
      to: "",
      existingId: null,
      origFrom: "",
      origTo: "",
    });
    expect(act.kind).toBe("close");
  });

  it("(b) leere Zelle + nur from getippt → error, kein Create", () => {
    const act = resolveEditorAction({
      from: "15:00",
      to: "",
      existingId: null,
      origFrom: "",
      origTo: "",
    });
    expect(act.kind).toBe("error");
  });

  it("(c) bestehender Eintrag + beide Felder leer → delete", () => {
    const act = resolveEditorAction({
      from: "",
      to: "",
      existingId: "abc-123",
      origFrom: "15:00",
      origTo: "23:00",
    });
    expect(act).toEqual({ kind: "delete", id: "abc-123" });
  });

  it("(d) bestehender Eintrag unverändert → noop", () => {
    const act = resolveEditorAction({
      from: "15:00",
      to: "23:00",
      existingId: "abc-123",
      origFrom: "15:00",
      origTo: "23:00",
    });
    expect(act.kind).toBe("noop");
  });

  it("bestehender Eintrag + gültige Änderung → update mit normalisierten Zeiten", () => {
    const act = resolveEditorAction({
      from: "1530",
      to: "22:00",
      existingId: "abc-123",
      origFrom: "15:00",
      origTo: "23:00",
    });
    expect(act).toEqual({ kind: "update", id: "abc-123", from: "15:30", to: "22:00" });
  });

  it("neue Zelle + beide Felder gültig → create", () => {
    const act = resolveEditorAction({
      from: "9",
      to: "17:00",
      existingId: null,
      origFrom: "",
      origTo: "",
    });
    expect(act).toEqual({ kind: "create", from: "09:00", to: "17:00" });
  });

  it("nur Whitespace zählt als leer", () => {
    const act = resolveEditorAction({
      from: "  ",
      to: "\t",
      existingId: null,
      origFrom: "",
      origTo: "",
    });
    expect(act.kind).toBe("close");
  });
});

describe("parseHHMM", () => {
  it("normalisiert Kurzformen", () => {
    expect(parseHHMM("930")).toBe("09:30");
    expect(parseHHMM("1530")).toBe("15:30");
    expect(parseHHMM("9")).toBe("09:00");
    expect(parseHHMM("15.30")).toBe("15:30");
  });
  it("weist Ungültiges ab", () => {
    expect(parseHHMM("2530")).toBe(null);
    expect(parseHHMM("abc")).toBe(null);
    expect(parseHHMM("")).toBe(null);
  });
});
