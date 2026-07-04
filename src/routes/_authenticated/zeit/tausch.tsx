import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  acceptSwapRequest,
  cancelSwapRequest,
  getMySwappableShifts,
  listMySwapRequests,
  listOpenSwapsForMe,
  type OpenSwapForMeRow,
} from "@/lib/roster/swap.functions";

export const Route = createFileRoute("/_authenticated/zeit/tausch")({
  head: () => ({
    meta: [
      { title: "Schichttausch" },
      { name: "description", content: "Schichten tauschen und Kollegen-Anfragen übernehmen" },
    ],
  }),
  component: SwapPage,
});

const AREA_LABEL: Record<"kitchen" | "service" | "gl", string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "GL",
};

const STATUS_LABEL: Record<string, string> = {
  open: "wartet auf Kollegen",
  peer_accepted: "wartet auf Freigabe durch die Betriebsleitung",
  approved: "genehmigt",
  rejected: "abgelehnt",
  cancelled: "storniert",
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  peer_accepted: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-neutral-200 text-neutral-700",
};

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function SwapPage() {
  const qc = useQueryClient();
  const listOpen = useServerFn(listOpenSwapsForMe);
  const listMine = useServerFn(listMySwapRequests);
  const cancelFn = useServerFn(cancelSwapRequest);

  const openQ = useQuery({
    queryKey: ["swap-open-for-me"],
    queryFn: () => listOpen(),
  });
  const mineQ = useQuery({
    queryKey: ["my-swap-requests"],
    queryFn: () => listMine(),
  });

  const [acceptFor, setAcceptFor] = useState<OpenSwapForMeRow | null>(null);

  const cancelMut = useMutation({
    mutationFn: (requestId: string) => cancelFn({ data: { requestId } }),
    onSuccess: () => {
      toast.success("Anfrage storniert.");
      qc.invalidateQueries({ queryKey: ["my-swap-requests"] });
      qc.invalidateQueries({ queryKey: ["my-swappable"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Schichttausch</h1>
        <Link to="/zeit" className="text-sm text-muted-foreground hover:text-foreground">
          Zurück
        </Link>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Anfragen an mich
        </h2>
        {openQ.isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
        ) : (openQ.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Keine offenen Anfragen für dich.
          </Card>
        ) : (
          <div className="space-y-3">
            {openQ.data!.map((r) => (
              <Card key={r.id} className="space-y-2 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{fmtDate(r.shiftDate)}</div>
                  <div className="text-xs text-muted-foreground">{AREA_LABEL[r.area]}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.locationName}
                  {r.skillName ? ` · ${r.skillName}` : ""}
                </div>
                <div className="text-xs">Von: {r.requesterName}</div>
                {r.note && (
                  <div className="rounded bg-muted px-2 py-1 text-xs italic">„{r.note}"</div>
                )}
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={() => setAcceptFor(r)}>
                    Übernehmen
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Meine Anfragen
        </h2>
        {mineQ.isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
        ) : (mineQ.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Du hast noch keine Anfragen gestellt.
          </Card>
        ) : (
          <div className="space-y-3">
            {mineQ.data!.map((r) => {
              const canCancel = r.status === "open" || r.status === "peer_accepted";
              return (
                <Card key={r.id} className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{fmtDate(r.shiftDate)}</div>
                    <div className="text-xs text-muted-foreground">{AREA_LABEL[r.area]}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.locationName}</div>
                  <div>
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? ""}`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  {r.peerName && (
                    <div className="text-xs text-muted-foreground">
                      Kollege: {r.peerName}
                      {r.peerShiftDate ? ` (Gegentausch ${fmtDate(r.peerShiftDate)})` : ""}
                    </div>
                  )}
                  {r.note && (
                    <div className="rounded bg-muted px-2 py-1 text-xs italic">„{r.note}"</div>
                  )}
                  {canCancel && (
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelMut.mutate(r.id)}
                        disabled={cancelMut.isPending}
                      >
                        Stornieren
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <AcceptDialog
        target={acceptFor}
        onClose={() => setAcceptFor(null)}
        onDone={() => {
          setAcceptFor(null);
          qc.invalidateQueries({ queryKey: ["swap-open-for-me"] });
          qc.invalidateQueries({ queryKey: ["my-swap-requests"] });
          qc.invalidateQueries({ queryKey: ["my-swappable"] });
        }}
      />
    </main>
  );
}

function AcceptDialog(props: {
  target: OpenSwapForMeRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { target } = props;
  const acceptFn = useServerFn(acceptSwapRequest);
  const fetchSwappable = useServerFn(getMySwappableShifts);
  const [counterId, setCounterId] = useState<string | "">("");

  // Eigene zukünftige Schichten in einem 60-Tage-Fenster (für optionalen Gegentausch)
  const range = useMemo(() => {
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const end = new Date(now);
    end.setDate(end.getDate() + 60);
    const to = end.toISOString().slice(0, 10);
    return { from, to };
  }, []);

  const mineQ = useQuery({
    queryKey: ["my-swappable", range.from, range.to],
    queryFn: () => fetchSwappable({ data: range }),
    enabled: !!target,
  });

  const candidates = useMemo(() => {
    if (!target) return [];
    return (mineQ.data ?? []).filter(
      (s) =>
        !s.hasActiveRequest &&
        s.area === target.area &&
        s.shiftDate > new Date().toISOString().slice(0, 10),
    );
  }, [mineQ.data, target]);

  const acceptMut = useMutation({
    mutationFn: (input: { requestId: string; counterShiftId?: string }) =>
      acceptFn({ data: input }),
    onSuccess: () => {
      toast.success("Übernommen — wartet auf Freigabe.");
      setCounterId("");
      props.onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setCounterId("");
          props.onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schicht übernehmen</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 text-sm">
            <div className="text-muted-foreground">
              {fmtDate(target.shiftDate)} · {target.locationName} · {AREA_LABEL[target.area]}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Optionaler Gegentausch
              </div>
              <select
                className="w-full rounded-md border px-2 py-2 text-sm"
                value={counterId}
                onChange={(e) => setCounterId(e.target.value)}
              >
                <option value="">Ohne Gegentausch</option>
                {candidates.map((s) => (
                  <option key={s.shiftId} value={s.shiftId}>
                    {fmtDate(s.shiftDate)} · {s.locationName} · {AREA_LABEL[s.area]}
                  </option>
                ))}
              </select>
              {mineQ.data && candidates.length === 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Keine eigene Schicht im gleichen Bereich verfügbar.
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() =>
              target &&
              acceptMut.mutate({
                requestId: target.id,
                counterShiftId: counterId || undefined,
              })
            }
            disabled={acceptMut.isPending || !target}
          >
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
