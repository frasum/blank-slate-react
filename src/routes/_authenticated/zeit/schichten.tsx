import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMyShifts } from "@/lib/roster/roster.functions";
import { groupMyShiftsByDate } from "@/lib/roster/my-shifts";

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
  const { from, to } = useMemo(() => computeRange(range), [range]);

  const query = useQuery({
    queryKey: ["my-shifts", from, to],
    queryFn: () => fetchShifts({ data: { from, to } }),
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
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
