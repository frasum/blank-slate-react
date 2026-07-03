// SM1 — Sofortmeldung-Banner für das Stammblatt.
// Zeigt Status, fehlende Felder, sv.net-Datenblock (kopierbar),
// „Als gemeldet markieren", „Nicht erforderlich"-Schalter.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSofortmeldungDetail,
  markSofortmeldungReported,
  setSofortmeldungRequired,
} from "@/lib/sofortmeldung/sofortmeldung.functions";
import type { SofortmeldungStatus } from "@/lib/sofortmeldung/sofortmeldung-rules";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/format-date";

const STATUS_LABEL: Record<SofortmeldungStatus, string> = {
  nicht_erforderlich: "nicht erforderlich",
  unvollstaendig: "unvollständig",
  bereit: "bereit für Meldung",
  gemeldet: "gemeldet",
};

function statusClass(status: SofortmeldungStatus): string {
  switch (status) {
    case "nicht_erforderlich":
      return "bg-muted text-muted-foreground";
    case "unvollstaendig":
      return "bg-destructive text-destructive-foreground";
    case "bereit":
      return "bg-emerald-600 text-white";
    case "gemeldet":
      return "bg-sky-600 text-white";
  }
}

export function SofortmeldungBanner({ staffId }: { staffId: string }) {
  const q = useQuery({
    queryKey: ["admin", "sofortmeldung", staffId],
    queryFn: () => getSofortmeldungDetail({ data: { staffId } }),
  });
  const queryClient = useQueryClient();
  const callMark = useServerFn(markSofortmeldungReported);
  const callSetReq = useServerFn(setSofortmeldungRequired);

  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "sofortmeldung", staffId] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "sofortmeldung-overview"] });
  };

  const markMut = useMutation({
    mutationFn: () => callMark({ data: { staffId, note: note.trim() || undefined } }),
    onSuccess: async () => {
      setMsg("Als gemeldet markiert.");
      setErr(null);
      setNote("");
      await invalidate();
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Fehler."),
  });

  const reqMut = useMutation({
    mutationFn: (required: boolean) => callSetReq({ data: { staffId, required } }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Fehler."),
  });

  if (q.isLoading) return null;
  if (q.error || !q.data)
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Sofortmeldung-Status konnte nicht geladen werden.
      </div>
    );

  const d = q.data;

  const copyBlock = async () => {
    const text = d.dataBlock.map((r) => `${r.label}: ${r.value}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Datenblock kopiert.");
      setErr(null);
    } catch {
      setErr("Kopieren fehlgeschlagen.");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Sofortmeldung §28a</span>
          <Badge className={statusClass(d.status)}>
            {STATUS_LABEL[d.status]}
            {d.status === "gemeldet" && d.reportedAt
              ? ` am ${formatShortDate(d.reportedAt)}`
              : ""}
          </Badge>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!d.required}
            disabled={reqMut.isPending || d.status === "gemeldet"}
            onChange={(e) => reqMut.mutate(!e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          nicht erforderlich
        </label>
      </div>

      {d.status === "unvollstaendig" && (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">Fehlende Angaben:</p>
          <ul className="list-disc pl-5 text-foreground">
            {d.missingFields.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Der Mitarbeiter kann diese Daten unter „Meine Daten" selbst beantragen.
          </p>
        </div>
      )}

      {(d.status === "bereit" || d.status === "gemeldet") && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Datenblock für sv.net
          </p>
          <div className="rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
            {d.dataBlock.map((r) => (
              <div key={r.label} className="flex gap-2">
                <span className="w-40 shrink-0 text-muted-foreground">{r.label}:</span>
                <span className="text-foreground">{r.value}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={copyBlock}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Datenblock kopieren
          </button>
        </div>
      )}

      {d.status === "bereit" && (
        <div className="space-y-2 border-t border-border pt-3">
          <label className="block text-xs text-muted-foreground">
            Notiz (optional)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={markMut.isPending}
            onClick={() => markMut.mutate()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {markMut.isPending ? "Speichere…" : "Als gemeldet markieren"}
          </button>
        </div>
      )}

      {d.status === "gemeldet" && (
        <p className="text-xs text-muted-foreground">
          Gemeldet {d.reportedAt ? `am ${formatShortDate(d.reportedAt)}` : ""}
          {d.reportedByName ? ` durch ${d.reportedByName}` : ""}
          {d.note ? ` · Notiz: ${d.note}` : ""}
        </p>
      )}

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
