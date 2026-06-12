import { describe, it, expect, vi } from "vitest";
import { runGuarded, type AuditWriter } from "./admin-call";
import { ForbiddenError } from "./role-guard";

describe("runGuarded — Audit-Hygiene", () => {
  it("schreibt audit_log bei erfolgreicher Operation als Admin", async () => {
    const writeAudit: AuditWriter = vi.fn(async () => {});
    const result = await runGuarded("admin", "admin", writeAudit, async () => ({
      result: 42,
      audit: { action: "test.action", entity: "test", entityId: "x" },
    }));
    expect(result).toBe(42);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("Negativtest (b): Nicht-Admin-Aufruf → abgelehnt, KEIN audit_log-Eintrag", async () => {
    const writeAudit: AuditWriter = vi.fn(async () => {});
    const op = vi.fn(async () => ({
      result: 1,
      audit: { action: "x", entity: "y" },
    }));
    await expect(runGuarded("staff", "admin", writeAudit, op)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(writeAudit).not.toHaveBeenCalled();
    expect(op).not.toHaveBeenCalled();
  });

  it("Aufruf ohne Rolle (null) → abgelehnt, KEIN audit_log-Eintrag", async () => {
    const writeAudit: AuditWriter = vi.fn(async () => {});
    await expect(
      runGuarded(null, "manager", writeAudit, async () => ({
        result: 1,
        audit: { action: "x", entity: "y" },
      })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("Fehler in op → KEIN audit_log-Eintrag", async () => {
    const writeAudit: AuditWriter = vi.fn(async () => {});
    await expect(
      runGuarded("admin", "admin", writeAudit, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("Manager-Aufruf gegen manager-Min-Rolle wird durchgelassen", async () => {
    const writeAudit: AuditWriter = vi.fn(async () => {});
    await runGuarded("manager", "manager", writeAudit, async () => ({
      result: "ok",
      audit: { action: "x", entity: "y" },
    }));
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });
});