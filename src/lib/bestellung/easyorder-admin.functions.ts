// Welle 4-D — EasyOrder Manager-Verwaltung.
//
// Manager+ vergeben/widerrufen EasyOrder-Zugriff je Mitarbeiter*Standort
// und pflegen die optionale Lieferanten-Whitelist. Alle Schreibwege gehen
// durch loadAdminCaller("manager") + runGuarded + Audit-Log. organizationId
// wird AUSSCHLIESSLICH aus dem Aufrufer abgeleitet; jede staff/location/
// supplier-Id wird vor dem Schreiben gegen die Org des Aufrufers validiert.
//
// Die `...Core`-Funktionen kapseln die DB-Logik testbar (siehe
// easyorder-admin.db.test.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog, makeAuditWriter } from "@/lib/admin/audit";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type EasyOrderAccessEntry = {
  accessId: string;
  locationId: string;
  locationName: string;
  canAddFreeItems: boolean;
  isActive: boolean;
  supplierIds: string[];
};

export type EasyOrderAccessRow = {
  staffId: string;
  staffName: string;
  canEasyorderAutoSend: boolean;
  entries: EasyOrderAccessEntry[];
};

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export async function listEasyOrderAccessCore(
  admin: Admin,
  organizationId: string,
): Promise<EasyOrderAccessRow[]> {
  const { data: staff, error: sErr } = await admin
    .from("staff")
    .select("id, display_name, is_active, can_easyorder_auto_send")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("display_name");
  if (sErr) throw new Error(sErr.message);

  const { data: access, error: aErr } = await admin
    .from("staff_easyorder_access")
    .select("id, staff_id, location_id, can_add_free_items, is_active, locations(name)")
    .eq("organization_id", organizationId);
  if (aErr) throw new Error(aErr.message);

  const { data: wl, error: wErr } = await admin
    .from("staff_easyorder_suppliers")
    .select("staff_id, location_id, supplier_id")
    .eq("organization_id", organizationId);
  if (wErr) throw new Error(wErr.message);

  // Index whitelist by staff+location.
  const whitelistKey = (staffId: string, locationId: string) => `${staffId}::${locationId}`;
  const wlMap = new Map<string, string[]>();
  for (const row of wl ?? []) {
    const k = whitelistKey(row.staff_id, row.location_id);
    const arr = wlMap.get(k) ?? [];
    arr.push(row.supplier_id);
    wlMap.set(k, arr);
  }

  const byStaff = new Map<string, EasyOrderAccessEntry[]>();
  for (const a of access ?? []) {
    const entries = byStaff.get(a.staff_id) ?? [];
    entries.push({
      accessId: a.id,
      locationId: a.location_id,
      locationName: (a.locations as { name: string } | null)?.name ?? "",
      canAddFreeItems: a.can_add_free_items,
      isActive: a.is_active,
      supplierIds: wlMap.get(whitelistKey(a.staff_id, a.location_id)) ?? [],
    });
    byStaff.set(a.staff_id, entries);
  }

  return (staff ?? []).map((s) => ({
    staffId: s.id,
    staffName: s.display_name,
    canEasyorderAutoSend: s.can_easyorder_auto_send ?? false,
    entries: (byStaff.get(s.id) ?? []).sort((x, y) => x.locationName.localeCompare(y.locationName)),
  }));
}

async function assertStaffInOrg(admin: Admin, organizationId: string, staffId: string) {
  const { data, error } = await admin
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Mitarbeiter nicht in dieser Organisation.");
}

async function assertLocationInOrg(admin: Admin, organizationId: string, locationId: string) {
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Standort nicht in dieser Organisation.");
}

export type GrantEasyOrderAccessInput = {
  staffId: string;
  locationId: string;
  canAddFreeItems: boolean;
  isActive: boolean;
};

export async function grantEasyOrderAccessCore(
  admin: Admin,
  organizationId: string,
  input: GrantEasyOrderAccessInput,
): Promise<{ ok: true }> {
  await assertStaffInOrg(admin, organizationId, input.staffId);
  await assertLocationInOrg(admin, organizationId, input.locationId);

  const { error } = await admin.from("staff_easyorder_access").upsert(
    {
      organization_id: organizationId,
      staff_id: input.staffId,
      location_id: input.locationId,
      can_add_free_items: input.canAddFreeItems,
      is_active: input.isActive,
    },
    { onConflict: "staff_id,location_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function revokeEasyOrderAccessCore(
  admin: Admin,
  organizationId: string,
  input: { staffId: string; locationId: string },
): Promise<{ ok: true }> {
  await assertStaffInOrg(admin, organizationId, input.staffId);
  await assertLocationInOrg(admin, organizationId, input.locationId);

  const { error: wErr } = await admin
    .from("staff_easyorder_suppliers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("staff_id", input.staffId)
    .eq("location_id", input.locationId);
  if (wErr) throw new Error(wErr.message);

  const { error } = await admin
    .from("staff_easyorder_access")
    .delete()
    .eq("organization_id", organizationId)
    .eq("staff_id", input.staffId)
    .eq("location_id", input.locationId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export type SetWhitelistInput = {
  staffId: string;
  locationId: string;
  supplierIds: string[];
};

export async function setEasyOrderSupplierWhitelistCore(
  admin: Admin,
  organizationId: string,
  input: SetWhitelistInput,
): Promise<{ ok: true; count: number }> {
  await assertStaffInOrg(admin, organizationId, input.staffId);
  await assertLocationInOrg(admin, organizationId, input.locationId);

  // Access-Row muss existieren.
  const { data: acc, error: accErr } = await admin
    .from("staff_easyorder_access")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("staff_id", input.staffId)
    .eq("location_id", input.locationId)
    .maybeSingle();
  if (accErr) throw new Error(accErr.message);
  if (!acc) {
    throw new Error("Whitelist kann nur gesetzt werden, wenn Zugriff existiert.");
  }

  // Lieferanten gegen Org validieren.
  const unique = Array.from(new Set(input.supplierIds));
  if (unique.length > 0) {
    const { data: rows, error: sErr } = await admin
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", unique);
    if (sErr) throw new Error(sErr.message);
    if ((rows?.length ?? 0) !== unique.length) {
      throw new Error("Lieferant nicht in dieser Organisation.");
    }
  }

  const { error: dErr } = await admin
    .from("staff_easyorder_suppliers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("staff_id", input.staffId)
    .eq("location_id", input.locationId);
  if (dErr) throw new Error(dErr.message);

  if (unique.length > 0) {
    const { error: iErr } = await admin.from("staff_easyorder_suppliers").insert(
      unique.map((supplierId) => ({
        organization_id: organizationId,
        staff_id: input.staffId,
        location_id: input.locationId,
        supplier_id: supplierId,
      })),
    );
    if (iErr) throw new Error(iErr.message);
  }

  return { ok: true, count: unique.length };
}

export async function setStaffEasyOrderAutoSendCore(
  admin: Admin,
  organizationId: string,
  input: { staffId: string; allowed: boolean },
): Promise<{ ok: true }> {
  await assertStaffInOrg(admin, organizationId, input.staffId);
  const { error } = await admin
    .from("staff")
    .update({ can_easyorder_auto_send: input.allowed })
    .eq("id", input.staffId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// createServerFn wrappers
// ---------------------------------------------------------------------------

export const listEasyOrderAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return listEasyOrderAccessCore(supabaseAdmin, caller.organizationId);
  });

const GrantInput = z.object({
  staffId: z.string().uuid(),
  locationId: z.string().uuid(),
  canAddFreeItems: z.boolean(),
  isActive: z.boolean(),
});

export const grantEasyOrderAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GrantInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await grantEasyOrderAccessCore(supabaseAdmin, caller.organizationId, data);
      return {
        result,
        audit: {
          action: "easyorder.access_granted",
          entity: "staff_easyorder_access",
          entityId: data.staffId,
          meta: {
            staffId: data.staffId,
            locationId: data.locationId,
            canAddFreeItems: data.canAddFreeItems,
            isActive: data.isActive,
          },
        },
      };
    });
  });

const RevokeInput = z.object({
  staffId: z.string().uuid(),
  locationId: z.string().uuid(),
});

export const revokeEasyOrderAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RevokeInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await revokeEasyOrderAccessCore(supabaseAdmin, caller.organizationId, data);
      return {
        result,
        audit: {
          action: "easyorder.access_revoked",
          entity: "staff_easyorder_access",
          entityId: data.staffId,
          meta: { staffId: data.staffId, locationId: data.locationId },
        },
      };
    });
  });

const WhitelistInput = z.object({
  staffId: z.string().uuid(),
  locationId: z.string().uuid(),
  supplierIds: z.array(z.string().uuid()),
});

export const setEasyOrderSupplierWhitelist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WhitelistInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await setEasyOrderSupplierWhitelistCore(
        supabaseAdmin,
        caller.organizationId,
        data,
      );
      return {
        result,
        audit: {
          action: "easyorder.whitelist_set",
          entity: "staff_easyorder_suppliers",
          entityId: data.staffId,
          meta: {
            staffId: data.staffId,
            locationId: data.locationId,
            count: result.count,
          },
        },
      };
    });
  });

const AutoSendInput = z.object({
  staffId: z.string().uuid(),
  allowed: z.boolean(),
});

export const setStaffEasyOrderAutoSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AutoSendInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await setStaffEasyOrderAutoSendCore(
        supabaseAdmin,
        caller.organizationId,
        data,
      );
      return {
        result,
        audit: {
          action: data.allowed ? "easyorder.auto_send_granted" : "easyorder.auto_send_revoked",
          entity: "staff",
          entityId: data.staffId,
          meta: { staffId: data.staffId, allowed: data.allowed },
        },
      };
    });
  });
