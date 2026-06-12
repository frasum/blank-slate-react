import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  clockIn,
  clockOut,
  getMyOpenEntry,
  listMyEntries,
} from "@/lib/time/time.functions";

export const Route = createFileRoute("/_authenticated/zeit/")({
  head: () => ({
    meta: [
      { title: "Zeiterfassung" },
      { name: "description", content: "Ein- und Ausstempeln" },
    ],
  }),
  component: ZeitPage,
});

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function ZeitPage() {
  const qc = useQueryClient();
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
    mutationFn: () => doClockIn(),
    onSuccess: () => {
      toast.success("Eingestempelt.");
      void qc.invalidateQueries({ queryKey: ["time"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const outMut = useMutation({
    mutationFn: () => doClockOut(),
    onSuccess: () => {
      toast.success("Ausgestempelt.");
      void qc.invalidateQueries({ queryKey: ["time"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = openQuery.data;
  const elapsed = open ? now.getTime() - new Date(open.startedAt).getTime() : 0;

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Zeiterfassung</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Zurück
        </Link>
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
              disabled={outMut.isPending}
              onClick={() => outMut.mutate()}
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
              disabled={inMut.isPending}
              onClick={() => inMut.mutate()}
            >
              {inMut.isPending ? "Wird gestempelt…" : "Einstempeln"}
            </Button>
          </div>
        )}
      </Card>

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
              <div
                key={e.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{formatDate(e.startedAt)}</div>
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