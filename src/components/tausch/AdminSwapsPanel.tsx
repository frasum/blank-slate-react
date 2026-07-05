// Admin-Panel für Schichttausch-Freigaben. Verhalten & Query-Keys unverändert
// gegenüber der früheren `SwapsTab`-Version in
// `src/routes/_authenticated/admin/personal-antraege.tsx` (TP-GL-Ära) —
// nur extrahiert, damit `/admin/urlaub` und (falls je nötig) andere Screens
// dieselbe UI nutzen können. Server-Fns: `listPendingSwaps`, `decideSwapRequest`.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPendingSwaps,
  decideSwapRequest,
  type PendingSwapRow,
} from "@/lib/roster/swap.functions";

function fmtDeDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y?.slice(2) ?? ""}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function areaLabel(a: "kitchen" | "service" | "gl"): string {
  return a === "kitchen" ? "Küche" : a === "service" ? "Service" : "GL";
}

export function AdminSwapsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "swap-requests"],
    queryFn: () => listPendingSwaps(),
  });
  const decideFn = useServerFn(decideSwapRequest);
  const [decideOn, setDecideOn] = useState<{
    request: PendingSwapRow;
    decision: "approved" | "rejected";
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!decideOn) return;
    setBusy(true);
    try {
      await decideFn({
        data: {
          requestId: decideOn.request.id,
          decision: decideOn.decision,
          note: note.trim() ? note.trim() : undefined,
        },
      });
      toast.success(
        decideOn.decision === "approved"
          ? "Tausch genehmigt und im Dienstplan vollzogen."
          : "Tauschanfrage abgelehnt.",
      );
      setDecideOn(null);
      setNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "swap-requests"] }),
        qc.invalidateQueries({ queryKey: ["admin", "review-pending-counts"] }),
        qc.invalidateQueries({ queryKey: ["roster-shifts"] }),
        qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (q.isError)
    return (
      <p className="text-sm text-destructive">
        Fehler beim Laden: {q.error instanceof Error ? q.error.message : "Unbekannt"}
      </p>
    );

  const rows = q.data ?? [];
  const pending = rows.filter((r) => r.status === "peer_accepted");
  const open = rows.filter((r) => r.status === "open");
  if (rows.length === 0)
    return <Card className="p-6 text-sm text-muted-foreground">Keine Tauschanfragen.</Card>;

  return (
    <>
      <div className="space-y-4">
        {pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Wartet auf Freigabe ({pending.length})
            </h2>
            {pending.map((r) => (
              <SwapCard
                key={r.id}
                row={r}
                onApprove={() => {
                  setDecideOn({ request: r, decision: "approved" });
                  setNote("");
                }}
                onReject={() => {
                  setDecideOn({ request: r, decision: "rejected" });
                  setNote("");
                }}
              />
            ))}
          </section>
        )}

        {open.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Läuft noch (Kollegen können übernehmen) — {open.length}
            </h2>
            {open.map((r) => (
              <SwapCard key={r.id} row={r} muted />
            ))}
          </section>
        )}
      </div>

      <Dialog
        open={!!decideOn}
        onOpenChange={(o) => {
          if (!o) {
            setDecideOn(null);
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideOn?.decision === "approved" ? "Tausch genehmigen" : "Tausch ablehnen"}
            </DialogTitle>
            <DialogDescription>
              {decideOn?.decision === "approved"
                ? "Genehmigen tauscht die Schichten im Dienstplan — atomar und unwiderruflich."
                : "Ablehnen belässt den Dienstplan unverändert."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="swap-note">Anmerkung (optional)</Label>
            <Textarea
              id="swap-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                decideOn?.decision === "rejected"
                  ? "Grund der Ablehnung, wird in der Notiz gespeichert."
                  : "Interne Anmerkung."
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOn(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant={decideOn?.decision === "rejected" ? "destructive" : "default"}
              onClick={submit}
              disabled={busy}
            >
              {busy ? "…" : decideOn?.decision === "approved" ? "Genehmigen" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SwapCard({
  row,
  muted,
  onApprove,
  onReject,
}: {
  row: PendingSwapRow;
  muted?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <Card className={muted ? "space-y-3 p-4 opacity-60" : "space-y-3 p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">
            {row.requester.name}
            {row.peer ? (
              <> → {row.peer.name}</>
            ) : (
              <span className="text-muted-foreground"> (noch keine Übernahme)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Anfrage vom {fmtDateTime(row.createdAt)}
            {row.respondedAt && <> · übernommen {fmtDateTime(row.respondedAt)}</>}
            {row.declineCount > 0 && <> · {row.declineCount} Ablehnungen</>}
          </div>
        </div>
        {onApprove && onReject && row.status === "peer_accepted" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReject}>
              Ablehnen
            </Button>
            <Button size="sm" onClick={onApprove}>
              Genehmigen
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Schicht des Anfragenden
          </div>
          <div className="text-sm text-foreground">
            {fmtDeDay(row.requesterShift.shiftDate)} · {areaLabel(row.requesterShift.area)}
            {row.requesterShift.skillLabel && <> · {row.requesterShift.skillLabel}</>}
          </div>
          <div className="text-xs text-muted-foreground">{row.requesterShift.locationName}</div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Gegenschicht</div>
          {row.peerShift ? (
            <>
              <div className="text-sm text-foreground">
                {fmtDeDay(row.peerShift.shiftDate)} · {areaLabel(row.peerShift.area)}
                {row.peerShift.skillLabel && <> · {row.peerShift.skillLabel}</>}
              </div>
              <div className="text-xs text-muted-foreground">{row.peerShift.locationName}</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              — keine (einseitige Übernahme)
            </div>
          )}
        </div>
      </div>

      {row.note && (
        <p className="text-sm text-foreground">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Anmerkung:</span>{" "}
          {row.note}
        </p>
      )}
    </Card>
  );
}
