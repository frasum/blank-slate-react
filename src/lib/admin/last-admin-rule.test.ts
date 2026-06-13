import { describe, it, expect } from "vitest";
import { wouldRemoveLastActiveAdmin, type AdminSnapshotEntry } from "./last-admin-rule";

const A: AdminSnapshotEntry = { staffId: "a", isActive: true, role: "admin" };
const B: AdminSnapshotEntry = { staffId: "b", isActive: true, role: "admin" };
const M: AdminSnapshotEntry = { staffId: "m", isActive: true, role: "manager" };

describe("wouldRemoveLastActiveAdmin", () => {
  it("lehnt Deaktivieren des EINZIGEN aktiven Admins ab (Negativtest a)", () => {
    const result = wouldRemoveLastActiveAdmin([A, M], { staffId: "a", nextActive: false });
    expect(result).toBe(true);
  });

  it("lehnt Rollenwechsel weg von admin ab, wenn es der einzige aktive Admin ist", () => {
    const result = wouldRemoveLastActiveAdmin([A, M], { staffId: "a", nextRole: "manager" });
    expect(result).toBe(true);
  });

  it("erlaubt Deaktivieren EINES von ZWEI aktiven Admins", () => {
    const result = wouldRemoveLastActiveAdmin([A, B], { staffId: "a", nextActive: false });
    expect(result).toBe(false);
  });

  it("erlaubt Rollenwechsel weg von admin, wenn ein zweiter aktiver Admin bleibt", () => {
    const result = wouldRemoveLastActiveAdmin([A, B], { staffId: "a", nextRole: "manager" });
    expect(result).toBe(false);
  });

  it("erlaubt Bearbeitung eines Nicht-Admins, auch wenn nur 1 Admin existiert", () => {
    const result = wouldRemoveLastActiveAdmin([A, M], { staffId: "m", nextActive: false });
    expect(result).toBe(false);
  });

  it("lehnt Aktion ab, wenn aktueller Snapshot bereits 0 aktive Admins enthält", () => {
    const snapshot: AdminSnapshotEntry[] = [{ ...A, isActive: false }];
    const result = wouldRemoveLastActiveAdmin(snapshot, { staffId: "a", nextRole: "manager" });
    expect(result).toBe(true);
  });

  it("lehnt Setzen von Rolle auf null bei letztem Admin ab", () => {
    const result = wouldRemoveLastActiveAdmin([A], { staffId: "a", nextRole: null });
    expect(result).toBe(true);
  });
});
