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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getMyShifts } from "@/lib/roster/roster.functions";
import { groupMyShiftsByDate } from "@/lib/roster/my-shifts";
import { createSwapRequest, getMySwappableShifts } from "@/lib/roster/swap.functions";

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
  const fetchSwappable = useServerFn(getMySwappableShifts);
  const offerFn = useServerFn(createSwapRequest);
  const qc = useQueryClient();
  const { from, to } = useMemo(() => computeRange(range), [range]);
  const [offerFor, setOfferFor] = useState<{ shiftId: string; label: string } | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["my-shifts", from, to],
    queryFn: () => fetchShifts({ data: { from, to } }),
  });
  const swapsQ = useQuery({
    queryKey: ["my-swappable", from, to],
    queryFn: () => fetchSwappable({ data: { from, to } }),
  });
  const swapStatus = useMemo(() => {
    const map = new Map<string, "open" | "peer_accepted" | "approved" | "rejected" | "cancelled">();
    for (const s of swapsQ.data ?? []) {
      if (s.swapStatus) map.set(s.shiftId, s.swapStatus);
    }
    return map;
  }, [swapsQ.data]);

  const offerMut = useMutation({
    mutationFn: (input: { shiftId: string; note: string }) =>
      offerFn({ data: { shiftId: input.shiftId, note: input.note || undefined } }),
    onSuccess: () => {
      toast.success("Schicht zum Tausch angeboten.");
      setOfferFor(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["my-swappable"] });
      qc.invalidateQueries({ queryKey: ["my-swap-requests"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Konnte nicht anbieten.");
    },
  });

  const days = useMemo(() => groupMyShiftsByDate(query.data ?? []), [query.data]);
  const todayIso = new Date().toISOString().slice(0, 10);

  function badgeFor(status: string | undefined): { label: string; className: string } | null {
    if (status === "open")
      return {
        label: "Tausch angefragt",
        className: "bg-amber-100 text-amber-800",
      };
    if (status === "peer_accepted")
      return {
        label: "Kollege gefunden – wartet auf Freigabe",
        className: "bg-blue-100 text-blue-800",
      };
    return null;
  }

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
                {day.shifts.map((s, i) => (
                  <div key={`${day.date}-${i}`} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{s.locationName}</div>
                      <div className="text-xs text-muted-foreground">{AREA_LABEL[s.area]}</div>
                    </div>
                    {s.skillLabel && (
                      <div className="text-xs text-muted-foreground">{s.skillLabel}</div>
                    )}
                    {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                    {(() => {
                      const st = swapStatus.get(s.shiftId);
                      const b = badgeFor(st);
                      const isFuture = day.date > todayIso;
                      return (
                        <div className="flex items-center justify-between pt-1">
                          {b ? (
                            <span
                              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${b.className}`}
                            >
                              {b.label}
                            </span>
                          ) : (
                            <span />
                          )}
                          {isFuture && !st && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setOfferFor({
                                  shiftId: s.shiftId,
                                  label: `${day.date} · ${s.locationName} · ${AREA_LABEL[s.area]}`,
                                })
                              }
                            >
                              Zum Tausch anbieten
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={!!offerFor}
        onOpenChange={(o) => {
          if (!o) {
            setOfferFor(null);
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schicht zum Tausch anbieten</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">{offerFor?.label}</div>
            <Textarea
              placeholder="Optionale Notiz für Kollegen (z. B. Grund)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferFor(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() =>
                offerFor && offerMut.mutate({ shiftId: offerFor.shiftId, note: note.trim() })
              }
              disabled={offerMut.isPending}
            >
              Anbieten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
