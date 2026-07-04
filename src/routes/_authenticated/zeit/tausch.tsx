import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  acceptSwapRequest,
  cancelSwapRequest,
  declineSwapRequest,
  listMyCandidateCounterShifts,
  listMySwapRequests,
  listOpenSwapsForMe,
  type MySwapRequestRow,
  type OpenSwapRow,
} from "@/lib/roster/swap.functions";

export const Route = createFileRoute("/_authenticated/zeit/tausch")({
  head: () => ({
    meta: [
      { title: "Schichttausch" },
      { name: "description", content: "Schichten mit Kollegen tauschen" },
    ],
  }),
  component: SwapPage,
});

const AREA_LABEL: Record<"kitchen" | "service" | "gl", string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "GL",
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusText(status: MySwapRequestRow["status"]): string {
  switch (status) {
    case "open":
      return "wartet auf Kollegen";
    case "peer_accepted":
      return "wartet auf Freigabe durch die Betriebsleitung";
    case "approved":
      return "genehmigt";
    case "rejected":
      return "abgelehnt";
    case "cancelled":
      return "storniert";
  }
}

function SwapPage() {
  const fetchOpen = useServerFn(listOpenSwapsForMe);
  const fetchMine = useServerFn(listMySwapRequests);
  const openQuery = useQuery({ queryKey: ["swaps-open-for-me"], queryFn: () => fetchOpen() });
  const mineQuery = useQuery({ queryKey: ["my-swap-requests"], queryFn: () => fetchMine() });

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
        {openQuery.isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
        ) : openQuery.isError ? (
          <Card className="p-6 text-sm text-destructive">Konnte nicht geladen werden.</Card>
        ) : (openQuery.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">Zurzeit keine offenen Anfragen.</Card>
        ) : (
          <div className="space-y-2">
            {(openQuery.data ?? []).map((r) => (
              <OpenRequestCard key={r.id} row={r} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Meine Anfragen
        </h2>
        {mineQuery.isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
        ) : mineQuery.isError ? (
          <Card className="p-6 text-sm text-destructive">Konnte nicht geladen werden.</Card>
        ) : (mineQuery.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Du hast noch keine Anfragen erstellt.
          </Card>
        ) : (
          <div className="space-y-2">
            {(mineQuery.data ?? []).map((r) => (
              <MyRequestCard key={r.id} row={r} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function OpenRequestCard({ row }: { row: OpenSwapRow }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptSwapRequest);
  const decline = useServerFn(declineSwapRequest);
  const fetchCandidates = useServerFn(listMyCandidateCounterShifts);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [counterShiftId, setCounterShiftId] = useState<string>("");

  const candidatesQuery = useQuery({
    queryKey: ["counter-candidates", row.locationId, row.area],
    queryFn: () => fetchCandidates({ data: { locationId: row.locationId, area: row.area } }),
    enabled: acceptOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["swaps-open-for-me"] });
    qc.invalidateQueries({ queryKey: ["my-swap-requests"] });
  };

  const acceptMut = useMutation({
    mutationFn: (input: { requestId: string; counterShiftId?: string }) => accept({ data: input }),
    onSuccess: () => {
      toast.success("Übernommen — wartet auf Freigabe.");
      setAcceptOpen(false);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Übernahme fehlgeschlagen."),
  });

  const declineMut = useMutation({
    mutationFn: () => decline({ data: { requestId: row.id } }),
    onSuccess: () => {
      toast.success("Anfrage abgelehnt.");
      setConfirmDecline(false);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Ablehnung fehlgeschlagen."),
  });

  return (
    <Card className="space-y-2 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">{formatDate(row.shiftDate)}</div>
        <div className="text-xs text-muted-foreground">
          {row.locationName} · {AREA_LABEL[row.area]}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">Von: {row.requesterName}</div>
      {row.skillLabel && (
        <div className="text-xs text-muted-foreground">Skill: {row.skillLabel}</div>
      )}
      {row.note && <div className="rounded bg-muted p-2 text-xs">„{row.note}"</div>}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => setAcceptOpen(true)}>
          Übernehmen
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirmDecline(true)}>
          Ablehnen
        </Button>
      </div>

      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schicht übernehmen</DialogTitle>
            <DialogDescription>
              Optional kannst du eine eigene Schicht als Gegentausch anbieten. Der Vollzug erfolgt
              erst nach Freigabe durch die Betriebsleitung.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Gegentausch (optional)</span>
            <select
              value={counterShiftId}
              onChange={(e) => setCounterShiftId(e.target.value)}
              className="w-full rounded-md border bg-background p-2 text-sm"
            >
              <option value="">— Kein Gegentausch —</option>
              {(candidatesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDate(c.shiftDate)}
                </option>
              ))}
            </select>
            {(candidatesQuery.data ?? []).length === 0 && !candidatesQuery.isLoading && (
              <span className="block text-xs text-muted-foreground">
                Du hast keine passenden zukünftigen Schichten an diesem Standort/Bereich.
              </span>
            )}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={acceptMut.isPending}
              onClick={() =>
                acceptMut.mutate({
                  requestId: row.id,
                  counterShiftId: counterShiftId || undefined,
                })
              }
            >
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDecline} onOpenChange={setConfirmDecline}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anfrage ablehnen?</DialogTitle>
            <DialogDescription>
              Diese Anfrage wird dir nicht mehr angezeigt. Diese Aktion kann nicht rückgängig
              gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDecline(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={declineMut.isPending}
              onClick={() => declineMut.mutate()}
            >
              Ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MyRequestCard({ row }: { row: MySwapRequestRow }) {
  const qc = useQueryClient();
  const cancel = useServerFn(cancelSwapRequest);
  const cancelMut = useMutation({
    mutationFn: () => cancel({ data: { requestId: row.id } }),
    onSuccess: () => {
      toast.success("Anfrage storniert.");
      qc.invalidateQueries({ queryKey: ["my-swap-requests"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Stornierung fehlgeschlagen."),
  });

  const allDeclined = useMemo(
    () =>
      (row.status === "open" || row.status === "peer_accepted") &&
      row.eligibleCount > 0 &&
      row.declineCount >= row.eligibleCount,
    [row.status, row.eligibleCount, row.declineCount],
  );

  const canCancel = row.status === "open" || row.status === "peer_accepted";

  return (
    <Card className="space-y-2 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">{formatDate(row.shiftDate)}</div>
        <div className="text-xs text-muted-foreground">
          {row.locationName} · {AREA_LABEL[row.area]}
        </div>
      </div>
      <div className="text-xs">
        <span className="font-medium">Status:</span>{" "}
        <span className="text-muted-foreground">{statusText(row.status)}</span>
      </div>
      {row.status === "peer_accepted" && row.peerStaffName && (
        <div className="text-xs text-muted-foreground">Übernommen von: {row.peerStaffName}</div>
      )}
      {row.note && <div className="rounded bg-muted p-2 text-xs">„{row.note}"</div>}
      {(row.status === "open" || row.status === "peer_accepted") && row.eligibleCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {row.declineCount} von {row.eligibleCount} berechtigten Kollegen haben abgelehnt.
        </div>
      )}
      {allDeclined && (
        <div className="rounded bg-amber-100 p-2 text-xs text-amber-900">
          Alle berechtigten Kollegen haben abgelehnt.
        </div>
      )}
      {canCancel && (
        <div>
          <Button
            size="sm"
            variant={allDeclined ? "default" : "outline"}
            disabled={cancelMut.isPending}
            onClick={() => cancelMut.mutate()}
          >
            Stornieren
          </Button>
        </div>
      )}
    </Card>
  );
}
