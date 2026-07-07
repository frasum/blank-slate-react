// TG1 — Vererbte Trinkgeld-Einstellungen (Org-Standard → Standort-Override).
//
// Alle Trinkgeld-Pfade laden ihre Parameter über diesen Loader, damit
// Standort-Overrides überall wirken. `loadOrgSettings` bleibt für Nicht-
// Trinkgeld-Nutzer (Wasserlinie etc.) unverändert bestehen.

export type TipSettings = {
  servicePoolEnabled: boolean;
  kitchenTipRate: number;
  tipPoolMinHours: number;
  kitchenManualOnly: boolean;
};

export type TipSettingsInput = {
  org: {
    kitchenTipRate: number;
    tipPoolMinHours: number;
    kitchenManualOnly: boolean;
  };
  location: {
    tipServicePoolEnabled: boolean;
    kitchenTipRateOverride: number | null;
    tipPoolMinHoursOverride: number | null;
    kitchenManualOnlyOverride: boolean | null;
  } | null;
};

/** Reine COALESCE-Vererbung. Wird von `loadTipSettings` und Tests genutzt. */
export function mergeTipSettings(input: TipSettingsInput): TipSettings {
  const loc = input.location;
  return {
    servicePoolEnabled: loc?.tipServicePoolEnabled ?? true,
    kitchenTipRate: loc?.kitchenTipRateOverride ?? input.org.kitchenTipRate,
    tipPoolMinHours: loc?.tipPoolMinHoursOverride ?? input.org.tipPoolMinHours,
    kitchenManualOnly: loc?.kitchenManualOnlyOverride ?? input.org.kitchenManualOnly,
  };
}

export async function loadTipSettings(
  orgId: string,
  locationId: string,
): Promise<TipSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [orgRes, locRes] = await Promise.all([
    supabaseAdmin
      .from("organization_settings")
      .select("kitchen_tip_rate, tip_pool_min_hours, kitchen_manual_only")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabaseAdmin
      .from("locations")
      .select(
        "tip_service_pool_enabled, kitchen_tip_rate_override, tip_pool_min_hours_override, kitchen_manual_only_override",
      )
      .eq("id", locationId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (orgRes.error) throw orgRes.error;
  if (locRes.error) throw locRes.error;
  return mergeTipSettings({
    org: {
      kitchenTipRate: Number(orgRes.data?.kitchen_tip_rate ?? 0.02),
      tipPoolMinHours: Number(orgRes.data?.tip_pool_min_hours ?? 2.5),
      kitchenManualOnly: Boolean(orgRes.data?.kitchen_manual_only ?? false),
    },
    location: locRes.data
      ? {
          tipServicePoolEnabled: locRes.data.tip_service_pool_enabled ?? true,
          kitchenTipRateOverride:
            locRes.data.kitchen_tip_rate_override == null
              ? null
              : Number(locRes.data.kitchen_tip_rate_override),
          tipPoolMinHoursOverride:
            locRes.data.tip_pool_min_hours_override == null
              ? null
              : Number(locRes.data.tip_pool_min_hours_override),
          kitchenManualOnlyOverride:
            locRes.data.kitchen_manual_only_override == null
              ? null
              : Boolean(locRes.data.kitchen_manual_only_override),
        }
      : null,
  });
}