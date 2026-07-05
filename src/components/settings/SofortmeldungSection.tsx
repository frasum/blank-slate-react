// Sektion „Sofortmeldung" — extrahiert im Rahmen von EIN1.
// Self-contained: eigene Query + Mutation + State + Feedback,
// Verhalten und Texte 1:1 wie zuvor in einstellungen.index.tsx.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgSettings } from "@/lib/admin/org-settings.functions";
import { setBetriebsnummer } from "@/lib/sofortmeldung/sofortmeldung.functions";

export function SofortmeldungSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const callSetBn = useServerFn(setBetriebsnummer);

  const settingsQ = useQuery({
    queryKey: ["admin", "org-settings"],
    queryFn: () => getOrgSettings(),
  });

  const [betriebsnummer, setBetriebsnummerLocal] = useState("");
  const [bnMsg, setBnMsg] = useState<string | null>(null);
  const [bnErr, setBnErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setBetriebsnummerLocal(settingsQ.data.betriebsnummer ?? "");
  }, [settingsQ.data]);

  const bnMutation = useMutation({
    mutationFn: () => callSetBn({ data: { betriebsnummer: betriebsnummer.trim() || null } }),
    onSuccess: async () => {
      setBnMsg("Gespeichert.");
      setBnErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setBnErr(e instanceof Error ? e.message : "Fehler.");
      setBnMsg(null);
    },
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Sofortmeldung</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Betriebsnummer der Krankenkassen-Meldestelle. Erscheint im sv.net-Datenblock beim
          Stammblatt jedes Mitarbeiters.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Betriebsnummer</span>
        <input
          type="text"
          inputMode="numeric"
          value={betriebsnummer}
          onChange={(e) => setBetriebsnummerLocal(e.target.value)}
          disabled={!canEdit}
          placeholder="z. B. 12345678"
          className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      {bnMsg && <p className="text-xs text-muted-foreground">{bnMsg}</p>}
      {bnErr && <p className="text-xs text-destructive">{bnErr}</p>}

      {canEdit && (
        <button
          type="button"
          disabled={bnMutation.isPending}
          onClick={() => {
            setBnMsg(null);
            setBnErr(null);
            bnMutation.mutate();
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {bnMutation.isPending ? "Speichern…" : "Speichern"}
        </button>
      )}
    </section>
  );
}