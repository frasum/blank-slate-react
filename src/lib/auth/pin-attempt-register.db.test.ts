// DB-Integrationstest für N3: atomares PIN-Rate-Limit via
// public.pin_attempt_register. Prüft, dass Zählen + Insert in einer
// Funktion laufen, das Limit hart greift und die Funktion nur der
// service_role zugänglich ist.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dbTestsEnabled, getServiceClient, seedOrg, type SeededOrg } from "@/test/db-setup";

const WINDOW_MS = 15 * 60 * 1000;
const STAFF_MAX = 5;
const IP_MAX = 30;

type RegisterArgs = {
  p_organization_id: string;
  p_staff_id: string;
  p_ip: string | null;
  p_window_ms: number;
  p_staff_max: number;
  p_ip_max: number;
};

describe.skipIf(!dbTestsEnabled)("N3 pin_attempt_register atomar", () => {
  const service = getServiceClient();
  let org: SeededOrg;
  let staffA: string;
  let staffB: string;
  let staffC: string;
  let staffD: string;

  beforeAll(async () => {
    org = await seedOrg("n3-pin-atomic");
    staffA = (await org.mkUser("staff")).staffId;
    staffB = (await org.mkUser("staff")).staffId;
    staffC = (await org.mkUser("staff")).staffId;
    staffD = (await org.mkUser("staff")).staffId;
  });

  afterAll(async () => {
    await org.cleanup();
  });

  async function register(args: RegisterArgs) {
    return service.rpc("pin_attempt_register", args as never);
  }

  it("(a) unterhalb des Limits liefert attempt_id und legt Zeile an", async () => {
    const { data, error } = await register({
      p_organization_id: org.orgId,
      p_staff_id: staffA,
      p_ip: "10.0.0.1",
      p_window_ms: WINDOW_MS,
      p_staff_max: STAFF_MAX,
      p_ip_max: IP_MAX,
    });
    expect(error).toBeNull();
    const row = (data ?? [])[0];
    expect(row?.attempt_id).toBeTruthy();
    const { data: rows } = await service
      .from("pin_attempts")
      .select("id")
      .eq("id", row!.attempt_id as string);
    expect(rows?.length).toBe(1);
  });

  it("(b) staff-Limit erreicht → attempt_id NULL, kein neuer Insert", async () => {
    // 5 Vorversuche seeden.
    for (let i = 0; i < STAFF_MAX; i += 1) {
      const { error } = await service
        .from("pin_attempts")
        .insert({ organization_id: org.orgId, staff_id: staffB, ip: "10.0.0.2" });
      expect(error).toBeNull();
    }
    const { count: before } = await service
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffB);

    const { data, error } = await register({
      p_organization_id: org.orgId,
      p_staff_id: staffB,
      p_ip: "10.0.0.2",
      p_window_ms: WINDOW_MS,
      p_staff_max: STAFF_MAX,
      p_ip_max: IP_MAX,
    });
    expect(error).toBeNull();
    const row = (data ?? [])[0];
    expect(row?.attempt_id).toBeNull();
    expect(row?.staff_failures).toBe(STAFF_MAX);

    const { count: after } = await service
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffB);
    expect(after).toBe(before);
  });

  it("(c) ip-Limit erreicht → attempt_id NULL", async () => {
    const ip = "10.0.0.3";
    // Wir setzen ip_max niedrig statt 30 Zeilen zu seeden.
    await service.from("pin_attempts").insert({ organization_id: org.orgId, staff_id: staffC, ip });

    const { data, error } = await register({
      p_organization_id: org.orgId,
      p_staff_id: staffC,
      p_ip: ip,
      p_window_ms: WINDOW_MS,
      p_staff_max: STAFF_MAX,
      p_ip_max: 1,
    });
    expect(error).toBeNull();
    const row = (data ?? [])[0];
    expect(row?.attempt_id).toBeNull();
    expect(row?.ip_failures).toBeGreaterThanOrEqual(1);
  });

  it("(d) anon/authenticated dürfen die Funktion nicht aufrufen", async () => {
    const anon = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc("pin_attempt_register", {
      p_organization_id: org.orgId,
      p_staff_id: staffA,
      p_ip: "10.0.0.9",
      p_window_ms: WINDOW_MS,
      p_staff_max: STAFF_MAX,
      p_ip_max: IP_MAX,
    } as never);
    expect(error).not.toBeNull();
  });

  it("(e) Versuch außerhalb des Fensters zählt nicht", async () => {
    // Alten Versuch (vor 2h) direkt setzen.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: old } = await service
      .from("pin_attempts")
      .insert({ organization_id: org.orgId, staff_id: staffD, ip: "10.0.0.4" })
      .select("id")
      .single();
    expect(old?.id).toBeTruthy();
    await service.from("pin_attempts").update({ attempted_at: twoHoursAgo }).eq("id", old!.id);

    const { data, error } = await register({
      p_organization_id: org.orgId,
      p_staff_id: staffD,
      p_ip: "10.0.0.4",
      p_window_ms: WINDOW_MS,
      p_staff_max: STAFF_MAX,
      p_ip_max: IP_MAX,
    });
    expect(error).toBeNull();
    const row = (data ?? [])[0];
    expect(row?.attempt_id).toBeTruthy();
    expect(row?.staff_failures).toBe(0);
    expect(row?.ip_failures).toBe(0);
  });
});
