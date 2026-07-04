// IMP1 — Zentrale Vorschau-Identität (admin_impersonations).
//
// - resolveActiveImpersonation(): liest die aktive Impersonation des
//   AUFRUFENDEN Admin-Users. Wird sowohl von getMyIdentity (UI-Banner) als
//   auch von loadStaffCaller (effektive Portal-Identität) genutzt — genau
//   EINE Aktiv-Logik, keine Duplikate.
// - assertRealIdentity(): wirft, wenn der Caller eine Vorschau ist. Wird
//   als ERSTE Zeile in JEDER mutierenden Staff-Caller-Function aufgerufen
//   (Vorschau ist schreibgeschützt). Die Verweigerung schreibt KEINEN
//   audit_log-Eintrag (B2a-Muster).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ActiveImpersonation = {
  targetStaffId: string;
  startedAt: string;
};

export async function resolveActiveImpersonation(
  supabase: SupabaseClient<Database>,
  adminUserId: string,
): Promise<ActiveImpersonation | null> {
  const { data } = await supabase
    .from("admin_impersonations")
    .select("target_staff_id, started_at")
    .eq("admin_user_id", adminUserId)
    .is("ended_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    targetStaffId: data.target_staff_id as string,
    startedAt: data.started_at as string,
  };
}

export const PREVIEW_READ_ONLY_MESSAGE =
  "Die Vorschau ist schreibgeschützt — Aktion nicht möglich.";

export function assertRealIdentity(caller: {
  impersonatedBy?: string | null;
}): void {
  if (caller.impersonatedBy) {
    throw new Error(PREVIEW_READ_ONLY_MESSAGE);
  }
}
