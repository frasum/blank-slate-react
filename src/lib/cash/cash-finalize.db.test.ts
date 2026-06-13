// B3b-Gate: DB-Integrationstest für finalize-Semantik.
// Geprüft (sequenziell, gleiche Session über mehrere Steps):
//   (1) finalize gelingt; status='finalized', finalized_at gesetzt.
//   (2) Nach finalize → updateSession blockt mit Reason 'session_finalized'
//       (Spec-Klärung M2-Steckbrief §5: finalize friert Sessionsicht ein).
//   (3) Nach finalize → correctWaiterSettlement bleibt erlaubt
//       (Korrekturen offen bis zur harten Sperre).
//   (4) Nach lock → sowohl updateSession als auch correctWaiterSettlement
//       sind blockiert.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import {
  submitWaiterSettlementCore,
  finalizeSessionCore,
  updateSessionCore,
  correctWaiterSettlementCore,
  lockSessionCore,
} from "./cash.functions";
import { CashLockedError } from "./cash-lock";
import type { StaffCaller } from "@/lib/time/time.functions";
import type { AdminCaller } from "@/lib/admin/admin-context";

describe.skipIf(!dbTestsEnabled)("finalize → update vs. correct (DB)", () => {
  let org: SeededOrg;
  let waiter: SeededUser;
  let manager: SeededUser;
  let admin: SeededUser;
  let sessionId: string;
  let settlementId: string;

  function s(): StaffCaller {
    return {
      userId: waiter.userId,
      staffId: waiter.staffId,
      organizationId: org.orgId,
      isActive: true,
    };
  }
  function mgr(): AdminCaller {
    return {
      userId: manager.userId,
      staffId: manager.staffId,
      organizationId: org.orgId,
      role: "manager",
    };
  }
  function adm(): AdminCaller {
    return {
      userId: admin.userId,
      staffId: admin.staffId,
      organizationId: org.orgId,
      role: "admin",
    };
  }

  function emptyUpdate(sid: string) {
    return {
      sessionId: sid,
      channelAmounts: [],
      terminalAmounts: [],
      vouchersSoldCents: 0,
      vouchersRedeemedCents: 0,
      finedineVouchersCents: 0,
      opentabsDeductionCents: 0,
      vorschussCents: 0,
      einladungCents: 0,
      sonstigeEinnahmeCents: 0,
      notes: null,
    };
  }

  beforeAll(async () => {
    org = await seedOrg("cash-finalize");
    waiter = await org.mkUser("staff");
    manager = await org.mkUser("manager");
    admin = await org.mkUser("admin");
    const { data: bd } = await org.service.rpc("current_business_date");
    const { data: sess } = await org.service
      .from("sessions")
      .insert({
        organization_id: org.orgId,
        business_date: bd as unknown as string,
        status: "open",
      })
      .select("id")
      .single();
    sessionId = sess!.id;
    const r = await submitWaiterSettlementCore(s(), {
      posSalesCents: 100000,
      cardTotalCents: 20000,
      hilfMahlCents: 0,
      openInvoicesCents: 0,
      cashHandedInCents: 80000,
    });
    settlementId = r.settlementId;
  });
  afterAll(async () => {
    await org.cleanup();
  });

  it("(1) finalize gelingt; Status='finalized'", async () => {
    await finalizeSessionCore(mgr(), { sessionId });
    const { data: sess } = await org.service
      .from("sessions")
      .select("status, finalized_at, finalized_by")
      .eq("id", sessionId)
      .single();
    expect(sess?.status).toBe("finalized");
    expect(sess?.finalized_at).not.toBeNull();
    expect(sess?.finalized_by).toBe(manager.staffId);
  });

  it("(2) Nach finalize → updateSession blockt (Reason 'session_finalized')", async () => {
    try {
      await updateSessionCore(mgr(), emptyUpdate(sessionId));
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CashLockedError);
      expect((e as CashLockedError).reason).toBe("session_finalized");
    }

    // DB unverändert (sanity).
    const { data: sess } = await org.service
      .from("sessions")
      .select("notes, vouchers_sold_cents")
      .eq("id", sessionId)
      .single();
    expect(sess?.notes).toBeNull();
    expect(sess?.vouchers_sold_cents).toBe(0);
  });

  it("(3) Nach finalize → correctWaiterSettlement bleibt erlaubt", async () => {
    const res = await correctWaiterSettlementCore(mgr(), {
      originalId: settlementId,
      posSalesCents: 110000,
      cardTotalCents: 20000,
      hilfMahlCents: 0,
      openInvoicesCents: 0,
      cashHandedInCents: 90000,
      reason: "nach finalize korrigiert",
    });
    expect(res.newId).not.toBe(settlementId);
    const { data: neu } = await org.service
      .from("waiter_settlements")
      .select("status, pos_sales_cents")
      .eq("id", res.newId)
      .single();
    expect(neu?.status).toBe("submitted");
    expect(neu?.pos_sales_cents).toBe(110000);
    settlementId = res.newId; // für Schritt 4
  });

  it("(4) Nach lock → update UND correct beide blockiert", async () => {
    await lockSessionCore(adm(), { sessionId });
    await expect(
      updateSessionCore(mgr(), emptyUpdate(sessionId)),
    ).rejects.toBeInstanceOf(CashLockedError);
    await expect(
      correctWaiterSettlementCore(mgr(), {
        originalId: settlementId,
        posSalesCents: 1,
        cardTotalCents: 0,
        hilfMahlCents: 0,
        openInvoicesCents: 0,
        cashHandedInCents: 1,
        reason: "x",
      }),
    ).rejects.toBeInstanceOf(CashLockedError);
  });
});