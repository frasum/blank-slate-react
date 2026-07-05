// Sektion „Arbeitgeber-Stammdaten" — extrahiert im Rahmen von EIN1.
// Self-contained; Verhalten und Texte 1:1 wie zuvor.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgSettings, setArbeitgeberStammdaten } from "@/lib/admin/org-settings.functions";

export function ArbeitgeberSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const callSetArbeitgeber = useServerFn(setArbeitgeberStammdaten);

  const settingsQ = useQuery({
    queryKey: ["admin", "org-settings"],
    queryFn: () => getOrgSettings(),
  });

  const [agName, setAgName] = useState("");
  const [agAdresse, setAgAdresse] = useState("");
  const [agVertreter, setAgVertreter] = useState("");
  const [agMsg, setAgMsg] = useState<string | null>(null);
  const [agErr, setAgErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setAgName(settingsQ.data.arbeitgeberName ?? "");
    setAgAdresse(settingsQ.data.arbeitgeberAdresse ?? "");
    setAgVertreter(settingsQ.data.arbeitgeberVertreter ?? "");
  }, [settingsQ.data]);

  const agMutation = useMutation({
    mutationFn: () =>
      callSetArbeitgeber({
        data: {
          arbeitgeberName: agName.trim() || null,
          arbeitgeberAdresse: agAdresse.trim() || null,
          arbeitgeberVertreter: agVertreter.trim() || null,
        },
      }),
    onSuccess: async () => {
      setAgMsg("Gespeichert.");
      setAgErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setAgErr(e instanceof Error ? e.message : "Fehler.");
      setAgMsg(null);
    },
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Arbeitgeber-Stammdaten</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Werden in Dokumenten (Arbeitsverträge, Bescheinigungen) über die Platzhalter{" "}
          <code>{"{{arbeitgeber_name}}"}</code>, <code>{"{{arbeitgeber_adresse}}"}</code> und{" "}
          <code>{"{{arbeitgeber_vertreter}}"}</code> verwendet.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Firmenname</span>
        <input
          type="text"
          value={agName}
          onChange={(e) => setAgName(e.target.value)}
          disabled={!canEdit}
          placeholder="z. B. Musterbetrieb GmbH"
          className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Anschrift</span>
        <textarea
          value={agAdresse}
          onChange={(e) => setAgAdresse(e.target.value)}
          disabled={!canEdit}
          rows={3}
          placeholder={"Straße Nr.\nPLZ Ort"}
          className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Vertretungsberechtigte Person
        </span>
        <input
          type="text"
          value={agVertreter}
          onChange={(e) => setAgVertreter(e.target.value)}
          disabled={!canEdit}
          placeholder="Vor- und Nachname"
          className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      {agMsg && <p className="text-xs text-muted-foreground">{agMsg}</p>}
      {agErr && <p className="text-xs text-destructive">{agErr}</p>}

      {canEdit && (
        <button
          type="button"
          disabled={agMutation.isPending}
          onClick={() => {
            setAgMsg(null);
            setAgErr(null);
            agMutation.mutate();
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {agMutation.isPending ? "Speichern…" : "Speichern"}
        </button>
      )}
    </section>
  );
}
