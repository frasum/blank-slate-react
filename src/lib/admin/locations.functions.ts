// Standort-Verwaltung (B1c). Admin legt Standorte an, benennt sie um,
// löscht sie — Löschen NUR möglich, wenn keine staff_locations-Zuordnung
// mehr darauf zeigt.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog, makeAuditWriter } from "./audit";

// Optionales Freitext-Feld: leere Strings → null, sonst getrimmt.
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v));

const detailsShape = {
  street: optText(200),
  postal_code: optText(20),
  city: optText(120),
  delivery_notes: optText(500),
  phone: optText(40),
  contact_name: optText(120),
  contact_phone: optText(40),
};

export const listLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data, error }, { data: org, error: orgErr }] = await Promise.all([
      supabaseAdmin
        .from("locations")
        .select(
          "id, name, timezone, street, postal_code, city, delivery_notes, phone, contact_name, contact_phone, latitude, longitude, geofence_radius_m, geocoded_at, geocoded_address, cash_balance_target_cents",
        )
        .eq("organization_id", caller.organizationId)
        .order("name"),
      supabaseAdmin
        .from("organizations")
        .select("cash_balance_target_cents")
        .eq("id", caller.organizationId)
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (orgErr) throw orgErr;
    const orgTarget = Number(org?.cash_balance_target_cents ?? 200_000);
    return (data ?? []).map((row) => {
      const raw =
        row.cash_balance_target_cents == null ? null : Number(row.cash_balance_target_cents);
      return {
        ...row,
        cashBalanceTargetCents: raw,
        cashBalanceTargetResolvedCents: raw ?? orgTarget,
      };
    });
  });

export const createLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().trim().min(1).max(120), ...detailsShape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("locations")
        .insert({
          organization_id: caller.organizationId,
          name: data.name,
          street: data.street,
          postal_code: data.postal_code,
          city: data.city,
          delivery_notes: data.delivery_notes,
          phone: data.phone,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: row.id },
        audit: {
          action: "location.create",
          entity: "location",
          entityId: row.id,
          meta: { name: data.name },
        },
      };
    });
  });

export const updateLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        cashBalanceTargetCents: z.number().int().min(0).nullable().optional(),
        ...detailsShape,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("locations")
        .update({
          name: data.name,
          street: data.street,
          postal_code: data.postal_code,
          city: data.city,
          delivery_notes: data.delivery_notes,
          phone: data.phone,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone,
          cash_balance_target_cents:
            data.cashBalanceTargetCents === undefined ? undefined : data.cashBalanceTargetCents,
        })
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "location.update",
          entity: "location",
          entityId: data.locationId,
          meta: { name: data.name },
        },
      };
    });
  });

export const deleteLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Block, falls Mitarbeiter noch zugeordnet sind.
      const { count, error: countErr } = await supabaseAdmin
        .from("staff_locations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new Error("Standort kann nicht gelöscht werden: noch Mitarbeiter zugeordnet.");
      }
      const { error } = await supabaseAdmin
        .from("locations")
        .delete()
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: { action: "location.delete", entity: "location", entityId: data.locationId },
      };
    });
  });

// =========================================================================
// Geofencing (B6) — Koordinaten + Radius pro Standort
// =========================================================================

function buildAddress(loc: {
  street: string | null;
  postal_code: string | null;
  city: string | null;
}): string {
  return [loc.street, [loc.postal_code, loc.city].filter(Boolean).join(" ")]
    .filter((s) => s && s.length > 0)
    .join(", ");
}

export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: loc, error: loadErr } = await supabaseAdmin
        .from("locations")
        .select("id, street, postal_code, city")
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!loc) throw new Error("Standort nicht gefunden.");
      const address = buildAddress(loc);
      if (!address) throw new Error("Bitte zuerst Straße/PLZ/Ort am Standort eintragen.");

      const { geocodeAddress } = await import("@/lib/geo/geocoding.server");
      const geo = await geocodeAddress(address);

      const { error: updErr } = await supabaseAdmin
        .from("locations")
        .update({
          latitude: geo.latitude,
          longitude: geo.longitude,
          geocoded_at: new Date().toISOString(),
          geocoded_address: geo.formattedAddress,
        })
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId);
      if (updErr) throw updErr;

      return {
        result: {
          latitude: geo.latitude,
          longitude: geo.longitude,
          formattedAddress: geo.formattedAddress,
        },
        audit: {
          action: "location.geocode",
          entity: "location",
          entityId: data.locationId,
          meta: { address, formattedAddress: geo.formattedAddress },
        },
      };
    });
  });

export const updateLocationGeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
        geofenceRadiusM: z.number().int().min(10).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // lat/lng nur paarweise erlaubt
      if ((data.latitude == null) !== (data.longitude == null)) {
        throw new Error("Breiten- und Längengrad nur gemeinsam setzen oder gemeinsam leeren.");
      }
      const { error } = await supabaseAdmin
        .from("locations")
        .update({
          latitude: data.latitude,
          longitude: data.longitude,
          geofence_radius_m: data.geofenceRadiusM,
          // Manuelles Override: Geocode-Zeitstempel zurücksetzen, damit klar ist,
          // dass die Koordinaten nicht aus Google stammen.
          geocoded_at: null,
          geocoded_address: null,
        })
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "location.geo_update",
          entity: "location",
          entityId: data.locationId,
          meta: {
            latitude: data.latitude,
            longitude: data.longitude,
            geofenceRadiusM: data.geofenceRadiusM,
          },
        },
      };
    });
  });
