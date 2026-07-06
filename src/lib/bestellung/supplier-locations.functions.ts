// SL1 — Server-Functions für supplier_locations (Kundennummer + Aktiv-Status
// je Lieferant je Standort).
//
// Semantik (siehe Migration + resolveCustomerNumber): fehlende Zeile = Lieferant
// am Standort AKTIV, keine standort-eigene Kundennummer (Fallback org-weit).
// Es gibt bewusst KEINEN Backfill; Zeilen entstehen erst durch Pflege im UI.
//
// Manager+ für Schreib- und Lesewege (die Anzeige ist Teil der Lieferanten-
// Pflege, die Manager ohnehin dürfen). Audit-Log auf Änderungen.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type SupplierLocationRow = {
  locationId: string;
  customerNumber: string | null;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Cross-Org-Guards (Muster: easyorder-admin.functions.ts).
// ---------------------------------------------------------------------------

async function assertSupplierInOrg(admin: Admin, organizationId: string, supplierId: string) {
  const { data, error } = await admin
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lieferant nicht in dieser Organisation.");
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

// ---------------------------------------------------------------------------
// Core helpers (testbar mit Service-Client).
// ---------------------------------------------------------------------------

export async function listSupplierLocationsCore(
  admin: Admin,
  organizationId: string,
  supplierId: string,
): Promise<SupplierLocationRow[]> {
  await assertSupplierInOrg(admin, organizationId, supplierId);
  const { data, error } = await admin
    .from("supplier_locations")
    .select("location_id, customer_number, is_active")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    locationId: r.location_id,
    customerNumber: r.customer_number,
    isActive: r.is_active,
  }));
}

export type SetSupplierLocationInput = {
  supplierId: string;
  locationId: string;
  customerNumber: string | null;
  isActive: boolean;
};

export async function setSupplierLocationCore(
  admin: Admin,
  organizationId: string,
  input: SetSupplierLocationInput,
): Promise<{ ok: true }> {
  await assertSupplierInOrg(admin, organizationId, input.supplierId);
  await assertLocationInOrg(admin, organizationId, input.locationId);

  const normalized =
    typeof input.customerNumber === "string" && input.customerNumber.trim().length > 0
      ? input.customerNumber.trim()
      : null;

  const { error } = await admin.from("supplier_locations").upsert(
    {
      organization_id: organizationId,
      supplier_id: input.supplierId,
      location_id: input.locationId,
      customer_number: normalized,
      is_active: input.isActive,
    },
    { onConflict: "supplier_id,location_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// createServerFn wrappers
// ---------------------------------------------------------------------------

const ListInput = z.object({
  supplierId: z.string().uuid(),
});

export const listSupplierLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return listSupplierLocationsCore(supabaseAdmin, caller.organizationId, data.supplierId);
  });

const SetInput = z.object({
  supplierId: z.string().uuid(),
  locationId: z.string().uuid(),
  customerNumber: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isActive: z.boolean(),
});

export const setSupplierLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await setSupplierLocationCore(supabaseAdmin, caller.organizationId, data);
      return {
        result,
        audit: {
          action: "supplier_location.set",
          entity: "supplier_locations",
          entityId: data.supplierId,
          meta: {
            supplierId: data.supplierId,
            locationId: data.locationId,
            customerNumber: data.customerNumber,
            isActive: data.isActive,
          },
        },
      };
    });
  });