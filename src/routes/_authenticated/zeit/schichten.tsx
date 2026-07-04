import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMyShifts } from "@/lib/roster/roster.functions";
import { groupMyShiftsByDate } from "@/lib/roster/my-shifts";
import {
  createSwapRequest,
  listMySwapRequests,
  type MySwapRequestRow,
} from "@/lib/roster/swap.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/zeit/schichten")({
  head: () => ({
    meta: [
      { title: "Meine Schichten" },
      { name: "description", content: "Eigene geplante Schichten" },
    ],
  }),
  component: MyShiftsPage,
});

type RangeKey = "month" | "week";

const AREA_LABEL: Record<"kitchen" | "service" | "gl", string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "GL",
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const from = isoDate(now);
  if (key === "week") {
    // bis Ende dieser Woche (Sonntag)
    const end = new Date(now);
    const dow = (end.getDay() + 6) % 7; // Mo=0..So=6
    end.setDate(end.getDate() + (6 - dow));
    return { from, to: isoDate(end) };
  }
  const end = new Date(now);
  end.setDate(end.getDate() + 27);
  return { from, to: isoDate(end) };
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function MyShiftsPage() {
  const [range, setRange] = useState<RangeKey>("month");
  const fetchShifts = useServerFn(getMyShifts);
  const fetchSwaps = useServerFn(listMySwapRequests);
  const createSwap = useServerFn(createSwapRequest);
  const qc = useQueryClient();
  const { from, to } = useMemo(() => computeRange(range), [range]);

  const query = useQuery({
    queryKey: ["my-shifts", from, to],
    queryFn: () => fetchShifts({ data: { from, to } }),
  });
  const swapsQuery = useQuery({
    queryKey: ["my-swap-requests"],
    queryFn: () => fetchSwaps(),
  });
  const swapByShift = useMemo(() => {
    const map = new Map<string, MySwapRequestRow>();
    for (const r of swapsQuery.data ?? []) {
      if (r.status === "open" || r.status === "peer_accepted") {
        map.set(r.shiftId, r);
      }
    }
    return map;
  }, [swapsQuery.data]);

  const [offerShiftId, setOfferShiftId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const todayIso = new Date().toISOString().slice(0, 10);

  const createMutation = useMutation({
    mutationFn: (input: { shiftId: string; note?: string }) => createSwap({ data: input }),
    onSuccess: () => {
      toast.success("Schicht wurde zum Tausch angeboten.");
      setOfferShiftId(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["my-swap-requests"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Anfrage fehlgeschlagen.");
    },
  });

  const days = useMemo(() => groupMyShiftsByDate(query.data ?? []), [query.data]);

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Meine Schichten</h1>
        <Link to="/zeit" className="text-sm text-muted-foreground hover:text-foreground">
          Zurück
        </Link>
      </header>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={range === "month" ? "default" : "outline"}
          onClick={() => setRange("month")}
        >
          4 Wochen
        </Button>
        <Button
          size="sm"
          variant={range === "week" ? "default" : "outline"}
          onClick={() => setRange("week")}
        >
          Diese Woche
        </Button>
      </div>

      {query.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
      ) : query.isError ? (
        <Card className="p-6 text-sm text-destructive">
          Schichten konnten nicht geladen werden.
        </Card>
      ) : days.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Für diesen Zeitraum sind keine Schichten geplant.
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <section key={day.date} className="space-y-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {formatDayHeader(day.date)}
              </h2>
              <Card className="divide-y">
                {day.shifts.map((s) => {
                  const swap = swapByShift.get(s.id);
                  const isFuture = s.shift_date > todayIso;
                  return (
                  <div key={s.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{s.locationName}</div>
                      <div className="text-xs text-muted-foreground">{AREA_LABEL[s.area]}</div>
                    </div>
                    {s.skillLabel && (
                      <div className="text-xs text-muted-foreground">{s.skillLabel}</div>
                    )}
                    {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                    {swap ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          {swap.status === "open"
                            ? "Tausch angefragt"
                            : "Kollege gefunden — wartet auf Freigabe"}
                        </span>
                        <Link
                          to="/zeit/tausch"
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Details
                        </Link>
                      </div>
                    ) : isFuture ? (
                      <div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setOfferShiftId(s.id);
                            setNote("");
                          }}
                        >
                          Zum Tausch anbieten
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      <Dialog open={offerShiftId !== null} onOpenChange={(o) => !o && setOfferShiftId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schicht zum Tausch anbieten</DialogTitle>
            <DialogDescription>
              Berechtigte Kollegen sehen deine Anfrage und können sie übernehmen oder ablehnen. Der
              Dienstplan ändert sich erst nach Freigabe durch die Betriebsleitung.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Notiz (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-md border bg-background p-2 text-sm"
              placeholder="z. B. Grund oder Wunschtausch"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferShiftId(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={createMutation.isPending}
              onClick={() =>
                offerShiftId &&
                createMutation.mutate({
                  shiftId: offerShiftId,
                  note: note.trim() ? note.trim() : undefined,
                })
              }
            >
              Anbieten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
