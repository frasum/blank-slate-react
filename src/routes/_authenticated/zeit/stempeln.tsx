import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arbzgMinimumBreak } from "@/lib/time/break-rules";
import { clockIn, clockOut, getMyOpenEntry, listMyEntries } from "@/lib/time/time.functions";
import { getCurrentPosition, GpsError } from "@/lib/geo/client";
import { formatShortDate } from "@/lib/format-date";
import { parseAbsenceTodayError, type AbsenceType } from "@/lib/time/absence-warn";
import { useIsPreview, PREVIEW_DISABLED_TOOLTIP } from "@/hooks/use-is-preview";
import { useAuth } from "@/hooks/use-auth";
import { isSumitr } from "@/lib/auth/special-cases";

export const Route = createFileRoute("/_authenticated/zeit/stempeln")({
  head: () => ({
    meta: [{ title: "Zeiterfassung" }, { name: "description", content: "Ein- und Ausstempeln" }],
  }),
  component: ZeitPage,
});

function formatGpsErr(err: unknown): string {
  if (err instanceof GpsError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unbekannter Fehler.";
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function ZeitPage() {
  const qc = useQueryClient();
  const isPreview = useIsPreview();
  const { identity, signOut } = useAuth();
  // Sonderfall Sumitr (siehe lib/auth/special-cases): direkter „Abmelden"-
  // Button statt „Zurück", weil dieser Mitarbeiter nur die Stempel-Seite nutzt.
  const showSignOut = isSumitr(identity);
  const fetchOpen = useServerFn(getMyOpenEntry);
  const fetchList = useServerFn(listMyEntries);
  const doClockIn = useServerFn(clockIn);
  const doClockOut = useServerFn(clockOut);

  const openQuery = useQuery({
    queryKey: ["time", "open"],
    queryFn: () => fetchOpen(),
  });
  const listQuery = useQuery({
    queryKey: ["time", "list"],
    queryFn: () => fetchList({ data: { limit: 20 } }),
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const inMut = useMutation({
    mutationFn: async (confirmAbsence?: boolean) => {
      const fix = await getCurrentPosition();
      return doClockIn({ data: { ...fix, ...(confirmAbsence ? { confirmAbsence: true } : {}) } });
    },
    onSuccess: () => {
      toast.success("Eingestempelt.");
      setAbsenceWarn(null);
      void qc.invalidateQueries({ queryKey: ["time"] });
    },
    onError: (e: Error) => {
      const type = parseAbsenceTodayError(e.message);
      if (type) {
        setAbsenceWarn(type);
        return;
      }
      toast.error(formatGpsErr(e));
    },
  });
  const outMut = useMutation({
    mutationFn: async (breakMinutes: number) => {
      const fix = await getCurrentPosition();
      return doClockOut({ data: { breakMinutes, ...fix } });
    },
    onSuccess: () => {
      toast.success("Ausgestempelt.");
      void qc.invalidateQueries({ queryKey: ["time"] });
      setBreakDialogOpen(false);
    },
    onError: (e: Error) => toast.error(formatGpsErr(e)),
  });

  const open = openQuery.data;
  const elapsed = open ? now.getTime() - new Date(open.startedAt).getTime() : 0;
  const grossMinutes = Math.max(0, Math.round(elapsed / 60000));
  const recommendedBreak = arbzgMinimumBreak(grossMinutes);

  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [breakInput, setBreakInput] = useState<string>("0");
  const [absenceWarn, setAbsenceWarn] = useState<AbsenceType | null>(null);

  function openBreakDialog() {
    setBreakInput(String(recommendedBreak));
    setBreakDialogOpen(true);
  }

  const parsedBreak = Number.parseInt(breakInput, 10);
  const breakValid = Number.isFinite(parsedBreak) && parsedBreak >= 0 && parsedBreak < 480;
  const breakShort = breakValid && parsedBreak < recommendedBreak;

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Zeiterfassung</h1>
        {showSignOut ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void signOut();
            }}
          >
            Abmelden
          </Button>
        ) : (
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Zurück
          </Link>
        )}
      </header>

      <Card className="p-6">
        {openQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Lade…</div>
        ) : open ? (
          <div className="space-y-4 text-center">
            <div className="text-sm text-muted-foreground">
              Eingestempelt um {formatTime(open.startedAt)}
            </div>
            <div className="font-mono text-5xl tabular-nums">{formatDuration(elapsed)}</div>
            <Button
              size="lg"
              variant="destructive"
              className="w-full"
              disabled={outMut.isPending || isPreview}
              title={isPreview ? PREVIEW_DISABLED_TOOLTIP : undefined}
              onClick={openBreakDialog}
            >
              {outMut.isPending ? "Wird gestempelt…" : "Ausstempeln"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="text-sm text-muted-foreground">Nicht eingestempelt</div>
            <Button
              size="lg"
              className="w-full"
              disabled={inMut.isPending || isPreview}
              title={isPreview ? PREVIEW_DISABLED_TOOLTIP : undefined}
              onClick={() => inMut.mutate(undefined)}
            >
              {inMut.isPending ? "Wird gestempelt…" : "Einstempeln"}
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause eintragen</DialogTitle>
            <DialogDescription>
              ArbZG-Empfehlung für diese Schicht: <strong>{recommendedBreak} Minuten</strong>. Bitte
              trage die tatsächlich genommene Pause ein.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="break-input">Pause in Minuten</Label>
            <Input
              id="break-input"
              type="number"
              min={0}
              max={479}
              step={5}
              value={breakInput}
              onChange={(e) => setBreakInput(e.target.value)}
              autoFocus
            />
            {breakShort && (
              <p className="text-sm text-destructive">
                Achtung: Pause liegt unter der ArbZG-Empfehlung ({recommendedBreak} Min). Wird im
                Audit als
                <code className="ml-1 rounded bg-muted px-1">arbzg_short</code> vermerkt.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!breakValid || outMut.isPending}
              onClick={() => outMut.mutate(parsedBreak)}
            >
              {outMut.isPending ? "Wird gestempelt…" : "Ausstempeln"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={absenceWarn !== null} onOpenChange={(o) => !o && setAbsenceWarn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {absenceWarn === "krank"
                ? "Du bist heute krankgemeldet."
                : "Du hast heute Urlaub eingetragen."}
            </DialogTitle>
            <DialogDescription>
              Trotzdem einstempeln? Die bewusste Entscheidung wird im Audit-Log dokumentiert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsenceWarn(null)}>
              Abbrechen
            </Button>
            <Button disabled={inMut.isPending} onClick={() => inMut.mutate(true)}>
              {inMut.isPending ? "Wird gestempelt…" : "Trotzdem einstempeln"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Letzte Einträge
        </h2>
        <Card className="divide-y">
          {listQuery.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Lade…</div>
          ) : !listQuery.data || listQuery.data.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Noch keine Einträge.</div>
          ) : (
            listQuery.data.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{formatShortDate(new Date(e.startedAt))}</div>
                  <div className="text-muted-foreground">
                    {formatTime(e.startedAt)} – {e.endedAt ? formatTime(e.endedAt) : "läuft"}
                  </div>
                </div>
                <div className="text-right text-muted-foreground">
                  {e.endedAt
                    ? formatDuration(
                        new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime(),
                      )
                    : "—"}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>
    </main>
  );
}
