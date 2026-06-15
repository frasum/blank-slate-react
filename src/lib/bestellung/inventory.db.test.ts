// DB-Integrationstest für Inventur (Welle 2).
// Skips ohne SUPABASE_DB_TESTS. Greift direkt auf die Tabellen zu, da die
// Server-Functions nur als createServerFn-Wrapper existieren.
//
// (a) Session erstellen → status in_progress, user_id gesetzt.
// (b) line_value_cents = round(total_qty * unit_price_cents) für fractional qty.
// (c) total_value_cents = Summe aller line_values nach zwei Items.
// (d) Upsert auf identische (session_id, article_id) ändert die Zeile in place.
// (e) Abgeschlossene Session: status completed, completed_at gesetzt; weiterer
//     Insert wird vom RLS-/Anwendungs-Pfad abgelehnt (hier per Application-Guard
//     im Test simuliert: wir prüfen, dass ein weiterer Insert nach Statuswechsel
//     die Anwendungs-Regel verletzen würde — direkt SQL würde RLS umgehen,
//     daher prüfen wir den Statuswert + completed_at und einen Insert über die
//     anon-Schicht ist nicht Teil dieses Tests).

import { describe, it, expect, beforeAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg, type SeededUser } from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)("inventur (DB)", () => {
  let org: SeededOrg;
  let user: SeededUser;
  let supplier: string;
  let artA: string;
  let artB: string;

  beforeAll(async () => {
    org = await seedOrg("inventur");
    user = await org.mkUser("manager");

    const { data: s } = await org.service
      .from("suppliers")
      .insert({ organization_id: org.orgId, name: "Inv-Lieferant", email: "inv@example.com" })
      .select("id")
      .single();
    supplier = s!.id;

    const mkArt = async (name: string, cents: number) => {
      const { data } = await org.service
        .from("articles")
        .insert({
          organization_id: org.orgId,
          supplier_id: supplier,
          name,
          price_cents: cents,
          unit: "kg",
        })
        .select("id")
        .single();
      return data!.id as string;
    };
    artA = await mkArt("Tomaten", 250);
    artB = await mkArt("Mehl", 120);
  });

  async function createSession(): Promise<string> {
    const { data, error } = await org.service
      .from("inventory_sessions")
      .insert({
        organization_id: org.orgId,
        location_id: org.defaultLocationId,
        user_id: user.userId,
      })
      .select("id, status, user_id")
      .single();
    expect(error).toBeNull();
    expect(data!.status).toBe("in_progress");
    expect(data!.user_id).toBe(user.userId);
    return data!.id as string;
  }

  async function upsertItem(
    sessionId: string,
    articleId: string,
    s1: number,
    s2: number,
    unitPriceCents: number,
  ) {
    const totalQty = s1 + s2;
    const lineValue = Math.round(totalQty * unitPriceCents);
    const { error } = await org.service.from("inventory_items").upsert(
      {
        organization_id: org.orgId,
        session_id: sessionId,
        article_id: articleId,
        storage_1: s1,
        storage_2: s2,
        unit_price_cents: unitPriceCents,
        line_value_cents: lineValue,
      },
      { onConflict: "session_id,article_id" },
    );
    expect(error).toBeNull();
    return lineValue;
  }

  async function recomputeTotal(sessionId: string): Promise<number> {
    const { data } = await org.service
      .from("inventory_items")
      .select("line_value_cents")
      .eq("session_id", sessionId);
    const total = (data ?? []).reduce((s, r) => s + Number(r.line_value_cents), 0);
    await org.service
      .from("inventory_sessions")
      .update({ total_value_cents: total })
      .eq("id", sessionId);
    return total;
  }

  it("(a) Session anlegen → status in_progress", async () => {
    await createSession();
  });

  it("(b) line_value_cents = round(total_qty * unit_price) für fraction qty", async () => {
    const sid = await createSession();
    await upsertItem(sid, artA, 1.5, 1, 250); // total 2.5 * 250 = 625
    const { data } = await org.service
      .from("inventory_items")
      .select("total_qty, line_value_cents")
      .eq("session_id", sid)
      .eq("article_id", artA)
      .single();
    expect(Number(data!.total_qty)).toBe(2.5);
    expect(Number(data!.line_value_cents)).toBe(625);
  });

  it("(c) total_value_cents = Summe aller line_values", async () => {
    const sid = await createSession();
    await upsertItem(sid, artA, 2, 0, 250); // 500
    await upsertItem(sid, artB, 1, 1, 120); // 240
    const total = await recomputeTotal(sid);
    expect(total).toBe(740);
    const { data } = await org.service
      .from("inventory_sessions")
      .select("total_value_cents")
      .eq("id", sid)
      .single();
    expect(Number(data!.total_value_cents)).toBe(740);
  });

  it("(d) Upsert auf gleichen Artikel ändert Zeile in place (UNIQUE respektiert)", async () => {
    const sid = await createSession();
    await upsertItem(sid, artA, 1, 0, 250);
    await upsertItem(sid, artA, 3, 2, 250); // overwrite → 5 * 250 = 1250
    const { data } = await org.service
      .from("inventory_items")
      .select("id, storage_1, storage_2, line_value_cents")
      .eq("session_id", sid)
      .eq("article_id", artA);
    expect(data!.length).toBe(1);
    expect(Number(data![0].storage_1)).toBe(3);
    expect(Number(data![0].storage_2)).toBe(2);
    expect(Number(data![0].line_value_cents)).toBe(1250);
  });

  it("(e) complete → status completed, completed_at gesetzt", async () => {
    const sid = await createSession();
    await upsertItem(sid, artA, 1, 1, 250);
    const total = await recomputeTotal(sid);
    const completedAt = new Date().toISOString();
    const { error } = await org.service
      .from("inventory_sessions")
      .update({ status: "completed", completed_at: completedAt, total_value_cents: total })
      .eq("id", sid);
    expect(error).toBeNull();

    const { data } = await org.service
      .from("inventory_sessions")
      .select("status, completed_at, total_value_cents")
      .eq("id", sid)
      .single();
    expect(data!.status).toBe("completed");
    expect(data!.completed_at).not.toBeNull();
    expect(Number(data!.total_value_cents)).toBe(500);
  });
});