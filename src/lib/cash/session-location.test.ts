import { describe, expect, it } from "vitest";
import { resolveSessionLocation } from "./session-location";

describe("resolveSessionLocation", () => {
  it("privileged, ein zugeordneter Standort → ok", () => {
    expect(
      resolveSessionLocation({
        isPrivileged: true,
        assignedLocationIds: ["A"],
        serviceShiftLocationIds: [],
      }),
    ).toEqual({ ok: true, locationId: "A" });
  });

  it("privileged, mehrere zugeordnete Standorte → ambiguous", () => {
    expect(
      resolveSessionLocation({
        isPrivileged: true,
        assignedLocationIds: ["A", "B"],
        serviceShiftLocationIds: [],
      }),
    ).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("staff, Service-Schicht an zugeordnetem Standort → ok", () => {
    expect(
      resolveSessionLocation({
        isPrivileged: false,
        assignedLocationIds: ["A"],
        serviceShiftLocationIds: ["A"],
      }),
    ).toEqual({ ok: true, locationId: "A" });
  });

  it("staff, keine Service-Schicht → not_scheduled", () => {
    expect(
      resolveSessionLocation({
        isPrivileged: false,
        assignedLocationIds: ["A"],
        serviceShiftLocationIds: [],
      }),
    ).toEqual({ ok: false, reason: "not_scheduled" });
  });

  it("staff, nur Küchen-Schicht (kein Service) → not_scheduled", () => {
    // Küchen-Schichten werden vom Aufrufer gar nicht erst geladen; die
    // Service-Liste bleibt leer.
    expect(
      resolveSessionLocation({
        isPrivileged: false,
        assignedLocationIds: ["A"],
        serviceShiftLocationIds: [],
      }),
    ).toEqual({ ok: false, reason: "not_scheduled" });
  });

  it("staff, Service-Schicht an nicht zugeordnetem Standort → not_scheduled", () => {
    expect(
      resolveSessionLocation({
        isPrivileged: false,
        assignedLocationIds: ["A"],
        serviceShiftLocationIds: ["B"],
      }),
    ).toEqual({ ok: false, reason: "not_scheduled" });
  });

  it("staff, Service an zwei zugeordneten Standorten → ambiguous", () => {
    expect(
      resolveSessionLocation({
        isPrivileged: false,
        assignedLocationIds: ["A", "B"],
        serviceShiftLocationIds: ["A", "B"],
      }),
    ).toEqual({ ok: false, reason: "ambiguous" });
  });
});