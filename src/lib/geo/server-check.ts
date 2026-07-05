// Server-seitiger Geofence-Wächter für Stempeluhr und EasyOrder.
// Lädt Standort-Koordinaten + Radius, ruft isWithinGeofence, wirft
// sprechende deutsche Fehlermeldungen. Wird ausschliesslich von
// Server-Functions aufgerufen (niemals vom Client).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isWithinGeofence, type GeofenceDecision } from "./geofence";

export type GeoCheckInput = {
  latitude: number;
  longitude: number;
  accuracyM: number;
};

export type GeoCheckResult = {
  decision: GeofenceDecision;
  fence: { latitude: number; longitude: number; radiusM: number };
};

export async function assertWithinFence(args: {
  admin: SupabaseClient<Database>;
  organizationId: string;
  locationId: string;
  fix: GeoCheckInput;
}): Promise<GeoCheckResult> {
  const { admin, organizationId, locationId, fix } = args;

  const { data: loc, error } = await admin
    // ST1: bewusst ungefiltert — Daten-Zugriff (Geofence-Check by id).
    .from("locations")
    .select("latitude, longitude, geofence_radius_m, name")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!loc) throw new Error("Standort nicht gefunden.");

  if (loc.latitude == null || loc.longitude == null) {
    throw new Error(
      `Standort „${loc.name}" hat keine GPS-Koordinaten hinterlegt. Bitte Manager kontaktieren.`,
    );
  }

  const fence = {
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
    radiusM: loc.geofence_radius_m ?? 100,
  };

  const decision = isWithinGeofence({ fix, fence });
  if (decision.ok) return { decision, fence };

  switch (decision.reason) {
    case "no_fix":
      throw new Error("Kein GPS-Signal. Bitte Standortfreigabe im Browser/Gerät prüfen.");
    case "accuracy_too_low":
      throw new Error(
        `GPS zu ungenau (±${Math.round(fix.accuracyM)} m, erlaubt ±${fence.radiusM} m). ` +
          "Bitte im Freien erneut versuchen.",
      );
    case "outside":
      throw new Error(
        `Du bist ${Math.round(decision.distanceM ?? 0)} m vom Standort entfernt ` +
          `(erlaubt: ${fence.radiusM} m).`,
      );
  }
}
