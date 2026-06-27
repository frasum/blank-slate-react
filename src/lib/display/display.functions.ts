// Display-Einstellungen pro Filiale (B-Display Minimum).
// Lesen/Anlegen/Aktualisieren/Token rotieren — nur Manager+Admin der eigenen
// Organisation. RLS sichert ab; loadAdminCaller prüft zusätzlich die Rolle.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";

export type DisplaySettings = {
  id: string;
  organization_id: string;
  location_id: string;
  display_token: string;
  is_enabled: boolean;
  refresh_interval_seconds: number;
  created_at: string;
  updated_at: string;
  rotation_enabled: boolean;
  rotation_interval_seconds: number;
  show_areas: string[] | null;
  show_header: boolean;
  show_footer: boolean;
  custom_message: string | null;
};

const ALLOWED_ROLES = ["manager", "admin"] as const;

export const getDisplaySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("display_settings" as never)
      .select("*")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .maybeSingle();
    if (error) throw error;
    return (row as DisplaySettings | null) ?? null;
  });

export const upsertDisplaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        isEnabled: z.boolean().optional(),
        refreshIntervalSeconds: z.number().int().min(15).max(3600).optional(),
        rotationEnabled: z.boolean().optional(),
        rotationIntervalSeconds: z.number().int().min(10).max(600).optional(),
        showAreas: z
          .array(z.enum(["kitchen", "service", "gl"]))
          .nullable()
          .optional(),
        showHeader: z.boolean().optional(),
        showFooter: z.boolean().optional(),
        customMessage: z.string().max(280).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Bestehende Settings holen oder neu anlegen.
    const { data: existing } = await supabaseAdmin
      .from("display_settings" as never)
      .select("id")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .maybeSingle();

    if (!existing) {
      const payload: Record<string, unknown> = {
        organization_id: caller.organizationId,
        location_id: data.locationId,
      };
      if (data.isEnabled !== undefined) payload.is_enabled = data.isEnabled;
      if (data.refreshIntervalSeconds !== undefined)
        payload.refresh_interval_seconds = data.refreshIntervalSeconds;
      if (data.rotationEnabled !== undefined) payload.rotation_enabled = data.rotationEnabled;
      if (data.rotationIntervalSeconds !== undefined)
        payload.rotation_interval_seconds = data.rotationIntervalSeconds;
      if (data.showAreas !== undefined) payload.show_areas = data.showAreas;
      if (data.showHeader !== undefined) payload.show_header = data.showHeader;
      if (data.showFooter !== undefined) payload.show_footer = data.showFooter;
      if (data.customMessage !== undefined) payload.custom_message = data.customMessage;
      const { data: row, error } = await supabaseAdmin
        .from("display_settings" as never)
        .insert(payload as never)
        .select("*")
        .single();
      if (error) throw error;
      return row as DisplaySettings;
    }

    const patch: Record<string, unknown> = {};
    if (data.isEnabled !== undefined) patch.is_enabled = data.isEnabled;
    if (data.refreshIntervalSeconds !== undefined)
      patch.refresh_interval_seconds = data.refreshIntervalSeconds;
    if (data.rotationEnabled !== undefined) patch.rotation_enabled = data.rotationEnabled;
    if (data.rotationIntervalSeconds !== undefined)
      patch.rotation_interval_seconds = data.rotationIntervalSeconds;
    if (data.showAreas !== undefined) patch.show_areas = data.showAreas;
    if (data.showHeader !== undefined) patch.show_header = data.showHeader;
    if (data.showFooter !== undefined) patch.show_footer = data.showFooter;
    if (data.customMessage !== undefined) patch.custom_message = data.customMessage;

    if (Object.keys(patch).length === 0) {
      const { data: row, error } = await supabaseAdmin
        .from("display_settings" as never)
        .select("*")
        .eq("id", (existing as { id: string }).id)
        .single();
      if (error) throw error;
      return row as DisplaySettings;
    }

    const { data: row, error } = await supabaseAdmin
      .from("display_settings" as never)
      .update(patch as never)
      .eq("id", (existing as { id: string }).id)
      .eq("organization_id", caller.organizationId)
      .select("*")
      .single();
    if (error) throw error;
    return row as DisplaySettings;
  });

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const regenerateDisplayToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newToken = generateToken();
    const { data: row, error } = await supabaseAdmin
      .from("display_settings" as never)
      .update({ display_token: newToken } as never)
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .select("*")
      .single();
    if (error) throw error;
    return row as DisplaySettings;
  });
