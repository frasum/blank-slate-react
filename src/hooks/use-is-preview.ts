// IMP1 — UI-Helfer: läuft aktuell eine Admin-Vorschau?
// Wird von Portal-Seiten genutzt, um Schreib-Buttons zu deaktivieren.
// Der eigentliche Schutz sitzt serverseitig (assertRealIdentity).

import { useAuth } from "@/hooks/use-auth";

export function useIsPreview(): boolean {
  const { identity } = useAuth();
  return identity?.impersonation.active === true;
}

export const PREVIEW_DISABLED_TOOLTIP = "In der Vorschau deaktiviert";