// Geschäftstag-Sperre ("Wasserlinie"). Gilt für ALLE Rollen — auch Manager.
// Nur Admin darf die Wasserlinie verschieben (separate Server-Function).
//
// assertBusinessDateUnlocked wird VOR jedem Schreibvorgang auf time_entries
// im Manager-Korrektur-Pfad aufgerufen. Bei Verstoß: TimeLockedError, KEIN
// audit_log-Eintrag (Gate-Punkt d).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export class TimeLockedError extends Error {
  constructor(
    public readonly businessDate: string,
    public readonly through: string,
  ) {
    super(
      `Geschäftstag ${businessDate} ist gesperrt (Wasserlinie: ${through}). ` +
        `Nur ein Admin kann die Sperre verschieben.`,
    );
    this.name = "TimeLockedError";
  }
}

export function isLocked(businessDate: string, through: string | null): boolean {
  if (!through) return false;
  return businessDate <= through; // ISO-Strings YYYY-MM-DD lexikographisch vergleichbar
}

export async function loadTimeLock(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("organization_settings")
    .select("time_locked_through_date")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.time_locked_through_date ?? null;
}

export async function assertBusinessDateUnlocked(
  admin: SupabaseClient<Database>,
  organizationId: string,
  businessDate: string,
): Promise<void> {
  const through = await loadTimeLock(admin, organizationId);
  if (isLocked(businessDate, through)) {
    throw new TimeLockedError(businessDate, through!);
  }
}
