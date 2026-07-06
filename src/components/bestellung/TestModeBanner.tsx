// TB1 — Warn-Banner „Testmodus aktiv".
// Wird im Bestellung-Layout (Admin) UND in EasyOrder (Staff) oben gerendert.
// Lädt den Status per Query beim Mount und rendert nichts, wenn der
// Testmodus aus ist. Nicht wegklickbar — solange aktiv, bleibt er sichtbar.

import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { getOrderTestModeStatus } from "@/lib/bestellung/test-mode-status.functions";

export function TestModeBanner() {
  const q = useQuery({
    queryKey: ["bestellung", "test-mode-status"],
    queryFn: () => getOrderTestModeStatus(),
    staleTime: 30_000,
  });
  if (!q.data?.enabled) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Testmodus aktiv</strong> — Bestell-E-Mails gehen an die
        Test-Adresse, nicht an Lieferanten.
      </span>
    </div>
  );
}
