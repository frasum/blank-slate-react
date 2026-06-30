// Öffentliche Display-Anzeige. Keine Auth — Zugriff per Token in der URL.
// Holt Daten alle refreshIntervalSeconds vom öffentlichen Endpoint.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Umbrella, HeartPulse, Heart } from "lucide-react";
import { serviceMarker } from "@/lib/roster/service-marker";
import { abbr, pillStyle } from "@/lib/roster/pill-style";
import { cn } from "@/lib/utils";

type DisplayCell = {
  k: "shift" | "urlaub" | "krank" | "wish" | "available" | "empty";
  skill: string | null;
  color: string | null;
};
type DisplayRow = {
  staffId: string;
  staffName: string;
  cells: DisplayCell[];
  shiftCount: number;
};
type DisplayBlock = {
  area: "kitchen" | "service";
  title: string;
  rows: DisplayRow[];
  dayCounts: number[];
};

type DisplayPayload = {
  location: { id: string; name: string };
  generatedAt: string;
  refreshIntervalSeconds: number;
  windowStart: string;
  windowEnd: string;
  days: string[];
  blocks: DisplayBlock[];
  showAreas: string[] | null;
  showHeader: boolean;
  showFooter: boolean;
  customMessage: string | null;
  birthdays: string[];
};

const searchSchema = z.object({ token: z.string().min(1).max(256).optional() });

export const Route = createFileRoute("/display/$locationId")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Dienstplan-Display" }] }),
  component: DisplayPage,
});

function formatTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDayHeader(iso: string): { wd: string; dm: string } {
  const d = new Date(iso + "T00:00:00Z");
  const wd = d.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });
  const dm = `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
  return { wd, dm };
}

function isWeekend(iso: string): boolean {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
}

function formatRangeLabel(start: string, end: string): string {
  const s = formatDayHeader(start);
  const e = formatDayHeader(end);
  return `${s.dm} – ${e.dm}`;
}

function DisplayPage() {
  const { locationId } = useParams({ from: "/display/$locationId" });
  const { token } = useSearch({ from: "/display/$locationId" });
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      if (!token) {
        setError("Sicherheits-Token fehlt in der URL.");
        return;
      }
      try {
        const res = await fetch(
          `/api/public/display/${encodeURIComponent(locationId)}?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (cancelled) return;
          setError(body.error ?? `Fehler ${res.status}`);
          timer = setTimeout(load, 30_000);
          return;
        }
        const json = (await res.json()) as DisplayPayload;
        if (cancelled) return;
        setData(json);
        setError(null);
        const ms = Math.max(15, json.refreshIntervalSeconds) * 1000;
        timer = setTimeout(load, ms);
      } catch {
        if (cancelled) return;
        setError("Verbindung fehlgeschlagen. Wird erneut versucht.");
        timer = setTimeout(load, 30_000);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [locationId, token]);

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
        <div className="max-w-md text-center">
          <h1 className="mb-3 text-3xl font-semibold">Display nicht verfügbar</h1>
          <p className="text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <p className="text-xl">Dienstplan wird geladen …</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {data.showHeader && (
        <header className="flex items-center justify-between border-b border-slate-800 px-10 py-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{data.location.name}</h1>
            <p className="mt-1 text-lg text-slate-400">
              {formatRangeLabel(data.windowStart, data.windowEnd)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-mono font-semibold tabular-nums">{formatTime(now)}</div>
            {error && <p className="mt-1 text-sm text-amber-400">{error}</p>}
          </div>
        </header>
      )}

      {data.customMessage && (
        <div className="border-b border-slate-800 bg-amber-500/10 px-10 py-3 text-center text-lg text-amber-200">
          {data.customMessage}
        </div>
      )}

      {data.birthdays.length > 0 && (
        <div className="border-b border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-500/20 px-10 py-5 text-center">
          <p className="text-3xl font-semibold tracking-tight text-amber-100">
            🎂 Heute Geburtstag: {data.birthdays.join(" · ")}
          </p>
        </div>
      )}

      <main className="space-y-8 p-6">
        {data.blocks.map((block) => (
          <BlockTable key={block.area} block={block} days={data.days} />
        ))}
        {data.blocks.length === 0 && (
          <p className="text-center text-slate-400">Keine Bereiche konfiguriert.</p>
        )}
      </main>

      {data.showFooter && (
        <footer className="border-t border-slate-800 px-10 py-4 text-center text-sm text-slate-400">
          <span className="font-medium text-slate-300">Legende:</span> X Arbeitet · − Frei · ☂
          Urlaub · 🌡 Krank · ♡ Wunsch-frei · ○ Verfügbar
        </footer>
      )}
    </div>
  );
}

function BlockTable({ block, days }: { block: DisplayBlock; days: string[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 bg-slate-900/60 px-4 py-3">
        <h2 className="text-xl font-semibold">{block.title}</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[10rem] border-b border-slate-800 bg-slate-900 px-3 py-2 text-center font-medium text-slate-300">
                Mitarbeiter
              </th>
              {days.map((iso, i) => {
                const { wd, dm } = formatDayHeader(iso);
                const today = i === 0;
                const we = isWeekend(iso);
                const cnt = block.dayCounts[i] ?? 0;
                return (
                  <th
                    key={iso}
                    className={[
                      "border-b border-slate-800 px-1 py-2 text-center font-medium",
                      today
                        ? "bg-sky-500/20 text-sky-100 ring-1 ring-inset ring-sky-400/60"
                        : we
                          ? "bg-slate-900/80 text-slate-400"
                          : "bg-slate-900 text-slate-300",
                    ].join(" ")}
                  >
                    <div className="leading-tight">{wd}</div>
                    <div className="leading-tight tabular-nums">{dm}</div>
                    <div
                      className={[
                        "leading-tight tabular-nums text-[10px] font-semibold",
                        cnt === 0
                          ? "text-slate-600"
                          : today
                            ? "text-sky-100"
                            : "text-slate-200",
                      ].join(" ")}
                    >
                      {cnt > 0 ? cnt : "·"}
                    </div>
                  </th>
                );
              })}
              <th
                className="sticky z-20 min-w-[8rem] border-b border-slate-800 bg-slate-900 px-3 py-2 text-center font-medium text-slate-300"
                style={{ right: 64 }}
              >
                Mitarbeiter
              </th>
              <th className="sticky right-0 z-20 min-w-[4rem] border-b border-slate-800 bg-slate-900 px-3 py-2 text-center font-medium text-slate-300">
                Σ
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.length === 0 && (
              <tr>
                <td colSpan={days.length + 3} className="px-4 py-6 text-center text-slate-500">
                  Keine Mitarbeiter für diesen Bereich.
                </td>
              </tr>
            )}
            {block.rows.map((row) => (
              <tr
                key={`${block.area}-${row.staffId}`}
                className="group/row even:bg-slate-900/40"
              >
                <td className="sticky left-0 z-10 border-b border-slate-800/60 bg-slate-950 px-3 py-1 text-center text-sm font-medium text-slate-100 group-even/row:bg-slate-900">
                  {row.staffName}
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={[
                      "border-b border-slate-800/60 p-1 text-center align-middle",
                      isWeekend(days[i]) ? "bg-slate-900/40" : "",
                      i === 0 ? "bg-sky-500/5" : "",
                    ].join(" ")}
                  >
                    <CellView cell={cell} area={block.area} />
                  </td>
                ))}
                <td
                  className="sticky z-10 min-w-[8rem] border-b border-slate-800/60 bg-slate-950 px-3 py-1 text-center text-sm font-medium text-slate-100 group-even/row:bg-slate-900"
                  style={{ right: 64 }}
                >
                  {row.staffName}
                </td>
                <td className="sticky right-0 z-10 min-w-[4rem] border-b border-slate-800/60 bg-slate-950 px-3 py-1 text-center text-sm font-semibold tabular-nums text-slate-100 group-even/row:bg-slate-900">
                  {row.shiftCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellView({ cell, area }: { cell: DisplayCell; area: "kitchen" | "service" }) {
  if (cell.k === "shift") {
    const label = area === "kitchen" ? abbr(cell.skill) : serviceMarker(cell.skill);
    const { backgroundColor, textClass } = pillStyle({
      skillColor: cell.color,
      area,
      label,
      status: "confirmed",
    });
    const isDefaultService = area === "service" && label === "X";
    return (
      <span
        style={{ backgroundColor }}
        className={cn(
          "mx-auto inline-flex h-5 w-8 items-center justify-center rounded border font-bold leading-none text-[9px]",
          textClass,
        )}
      >
        <span className={cn(isDefaultService && "text-[13px] leading-none")}>{label}</span>
      </span>
    );
  }
  if (cell.k === "urlaub") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded text-green-400">
        <Umbrella className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (cell.k === "krank") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded text-red-400">
        <HeartPulse className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (cell.k === "wish") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded text-purple-400">
        <Heart className="h-3.5 w-3.5 fill-purple-400" />
      </span>
    );
  }
  if (cell.k === "available") {
    return <span className="text-slate-500">○</span>;
  }
  return <span className="text-slate-600">−</span>;
}
