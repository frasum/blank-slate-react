// Öffentliche Display-Anzeige. Keine Auth — Zugriff per Token in der URL.
// Holt Daten alle refreshIntervalSeconds vom öffentlichen Endpoint.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Umbrella, HeartPulse, Heart } from "lucide-react";
import { serviceMarker } from "@/lib/roster/service-marker";
import { abbr, pillStyle } from "@/lib/roster/pill-style";
import { cn } from "@/lib/utils";
import { useFitCellSize } from "@/lib/display/use-fit-cell-size";
import { periodRangeLabel } from "@/lib/display/period-split";
import {
  isReminderActive,
  nowBerlinParts,
  sortReminders,
  type Reminder,
} from "@/lib/display/reminders";
import { businessDateOf } from "@/lib/business-date";
import { DISPLAY_PERIOD_SWITCH_HOUR } from "@/lib/time/period-label";

type DisplayCell = {
  k: "shift" | "urlaub" | "krank" | "wish" | "available" | "empty";
  skill: string | null;
  color: string | null;
};
type DisplayRow = {
  staffId: string;
  staffName: string;
  cells: DisplayCell[];
  shiftCountCurrent: number;
  shiftCountNext: number;
};
type DisplayBlock = {
  area: "kitchen" | "service";
  title: string;
  rows: DisplayRow[];
  dayCounts: number[];
};
type DisplayPeriodBlocks = {
  period: "mittag" | "abend";
  blocks: DisplayBlock[];
};

type DisplayPayload = {
  location: { id: string; name: string };
  generatedAt: string;
  refreshIntervalSeconds: number;
  rotationIntervalSeconds: number;
  dayServiceEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  days: string[];
  blocks: DisplayBlock[];
  periodBlocks: DisplayPeriodBlocks[] | null;
  showAreas: string[] | null;
  showHeader: boolean;
  showFooter: boolean;
  customMessage: string | null;
  birthdays: string[];
  currentPeriodLabel: string;
  nextPeriodLabel: string;
  currentPeriodEnd: string;
  nextPeriodEnd: string;
  reminders: Reminder[];
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
    // DP1b: 1-s-Takt, damit der 15/15-Vollbild-Wechsel exakt greift.
    const t = setInterval(() => setNow(new Date()), 1000);
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
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{data.location.name}</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {formatRangeLabel(data.windowStart, data.windowEnd)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-semibold tabular-nums">{formatTime(now)}</div>
            {error && <p className="mt-1 text-xs text-amber-400">{error}</p>}
          </div>
        </header>
      )}

      {(() => {
        const nowB = nowBerlinParts(now);
        const bd = businessDateOf(now);
        const due = sortReminders(
          (data.reminders ?? []).filter((r) => isReminderActive(r, nowB, bd)),
        );
        // Deterministischer 15/15-Takt aus der Uhrzeit — synchron über
        // mehrere Displays, keine Sprünge bei Refresh/Remount.
        const secondsSinceMidnight =
          now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const phaseA = Math.floor(secondsSinceMidnight / 15) % 2 === 0;
        if (due.length > 0 && phaseA) {
          return <ReminderFullscreen reminders={due} />;
        }
        return null;
      })()}

      {data.birthdays.length > 0 && (
        <div className="border-b border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-500/20 px-6 py-3 text-center">
          <p className="text-xl font-semibold tracking-tight text-amber-100">
            🎂 Heute Geburtstag: {data.birthdays.join(" · ")}
          </p>
        </div>
      )}

      <main className="space-y-4 p-3">
        {data.blocks.map((block, idx) => (
          <div key={block.area} className="space-y-4">
            <BlockTable block={block} days={data.days} payload={data} />
            {data.customMessage && idx < data.blocks.length - 1 && (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-3 text-center text-base text-amber-200">
                {data.customMessage}
              </div>
            )}
          </div>
        ))}
        {data.customMessage && data.blocks.length <= 1 && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-3 text-center text-base text-amber-200">
            {data.customMessage}
          </div>
        )}
        {data.blocks.length === 0 && (
          <p className="text-center text-slate-400">Keine Bereiche konfiguriert.</p>
        )}
      </main>

      {data.showFooter && (
        <footer className="border-t border-slate-800 px-6 py-2 text-center text-xs text-slate-400">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>
              <span className="font-medium text-slate-300">Küche:</span> VS Vorspeise · PA Pass · SP
              Spülen · CO Kochen
            </span>
            <span>
              <span className="font-medium text-slate-300">Service:</span> X Service · GL
              Geschäftsleitung · B Bar · 19h 19-Uhr-Schicht · H Hausmeister
            </span>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-slate-300">Status:</span>
              <span>− Frei</span>
              <span className="inline-flex items-center gap-1">
                <Umbrella className="h-3 w-3 text-green-400" /> Urlaub
              </span>
              <span className="inline-flex items-center gap-1">
                <HeartPulse className="h-3 w-3 text-red-400" /> Krank
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3 fill-purple-400 text-purple-400" /> Wunsch-frei
              </span>
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}

function BlockTable({
  block,
  days,
  payload,
}: {
  block: DisplayBlock;
  days: string[];
  payload: DisplayPayload;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { cellSize, leftNameWidth, rightNameWidth, sumColWidth, showRightName } = useFitCellSize(
    containerRef,
    days.length,
  );
  const tableWidth = leftNameWidth + cellSize * days.length + rightNameWidth + sumColWidth * 2;
  const curRange = periodRangeLabel(payload.currentPeriodEnd);
  const nxtRange = periodRangeLabel(payload.nextPeriodEnd);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 bg-slate-900/60 px-3 py-2">
        <h2 className="text-base font-semibold">{block.title}</h2>
      </header>
      <div ref={containerRef} className="overflow-x-auto">
        <table
          className="border-separate border-spacing-0 text-xs"
          style={{ tableLayout: "fixed", width: `${tableWidth}px` }}
        >
          <colgroup>
            <col style={{ width: `${leftNameWidth}px` }} />
            {days.map((iso) => (
              <col key={iso} style={{ width: `${cellSize}px` }} />
            ))}
            {showRightName && <col style={{ width: `${rightNameWidth}px` }} />}
            <col style={{ width: `${sumColWidth}px` }} />
            <col style={{ width: `${sumColWidth}px` }} />
          </colgroup>
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
                      "border-b border-slate-800 px-0.5 py-1 text-center font-medium leading-tight",
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
                        cnt === 0 ? "text-slate-600" : today ? "text-sky-100" : "text-slate-200",
                      ].join(" ")}
                    >
                      {cnt > 0 ? cnt : "·"}
                    </div>
                  </th>
                );
              })}
              {showRightName && (
                <th
                  className="sticky z-20 border-b border-slate-800 bg-slate-900 px-2 py-1 text-center font-medium text-slate-300"
                  style={{ right: sumColWidth * 2 }}
                >
                  Mitarbeiter
                </th>
              )}
              <th
                className="sticky z-20 border-b border-slate-800 bg-slate-900 px-1 py-1 text-center font-semibold text-slate-200 truncate"
                style={{ right: sumColWidth }}
                title={`Abrechnungsperiode ${curRange}`}
              >
                {payload.currentPeriodLabel}
              </th>
              <th
                className="sticky right-0 z-20 border-b border-slate-800 bg-slate-900 px-1 py-1 text-center font-medium text-slate-400 truncate"
                title={`Abrechnungsperiode ${nxtRange}`}
              >
                {payload.nextPeriodLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.length === 0 && (
              <tr>
                <td
                  colSpan={days.length + (showRightName ? 4 : 3)}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  Keine Mitarbeiter für diesen Bereich.
                </td>
              </tr>
            )}
            {block.rows.map((row) => (
              <tr key={`${block.area}-${row.staffId}`} className="group/row even:bg-slate-900/40">
                <td className="sticky left-0 z-10 truncate border-b border-slate-800/60 bg-slate-950 px-2 py-0.5 text-center text-xs font-medium text-slate-100 group-even/row:bg-slate-900">
                  {row.staffName}
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={[
                      "border-b border-slate-800/60 px-0.5 py-0.5 text-center align-middle bg-slate-950 group-even/row:bg-slate-800/70",
                      isWeekend(days[i]) ? "ring-1 ring-inset ring-slate-700/40" : "",
                      i === 0 ? "ring-1 ring-inset ring-sky-400/40" : "",
                    ].join(" ")}
                  >
                    <CellView cell={cell} area={block.area} />
                  </td>
                ))}
                {showRightName && (
                  <td
                    className="sticky z-10 truncate border-b border-slate-800/60 bg-slate-950 px-2 py-0.5 text-center text-xs font-medium text-slate-100 group-even/row:bg-slate-900"
                    style={{ right: sumColWidth * 2 }}
                  >
                    {row.staffName}
                  </td>
                )}
                <td
                  className="sticky z-10 border-b border-slate-800/60 bg-slate-950 px-2 py-0.5 text-center text-xs font-semibold tabular-nums text-slate-100 group-even/row:bg-slate-900"
                  style={{ right: sumColWidth }}
                >
                  {row.shiftCountCurrent}
                </td>
                <td className="sticky right-0 z-10 border-b border-slate-800/60 bg-slate-950 px-2 py-0.5 text-center text-xs tabular-nums text-slate-400 group-even/row:bg-slate-900">
                  {row.shiftCountNext}
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
    return <span className="text-slate-600">−</span>;
  }
  return <span className="text-slate-600">−</span>;
}

// DP1b: Farb-Palette für die Vollbild-Warnungen. Kräftige Töne mit gutem
// Kontrast für Display-Distanz. Die Aufmerksamkeit kommt aus dem 15/15-
// Wechsel Vollbild ↔ Plan — kein Blinken auf Einzel-Elementen mehr.
const REMINDER_STYLE: Record<Reminder["color"], { bg: string; text: string; border: string }> = {
  grau: { bg: "bg-slate-600", text: "text-slate-50", border: "border-slate-400/60" },
  braun: { bg: "bg-amber-900", text: "text-amber-50", border: "border-amber-700/70" },
  blau: { bg: "bg-blue-700", text: "text-blue-50", border: "border-blue-400/60" },
  gruen: { bg: "bg-emerald-700", text: "text-emerald-50", border: "border-emerald-400/60" },
  gelb: { bg: "bg-yellow-400", text: "text-yellow-950", border: "border-yellow-200" },
  orange: { bg: "bg-orange-600", text: "text-orange-50", border: "border-orange-300/70" },
  rot: { bg: "bg-red-700", text: "text-red-50", border: "border-red-400/60" },
  violett: { bg: "bg-violet-700", text: "text-violet-50", border: "border-violet-400/60" },
};

/**
 * DP1b: Vollbild-Overlay während Phase A des 15/15-Wechsels.
 * Hintergrund in der Farbe der ersten fälligen Erinnerung, alle weiteren
 * darunter als große Karten in ihrer eigenen Farbe.
 */
function ReminderFullscreen({ reminders }: { reminders: Reminder[] }) {
  const first = reminders[0];
  const base = REMINDER_STYLE[first.color] ?? REMINDER_STYLE.grau;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 p-10",
        base.bg,
        base.text,
      )}
      role="alert"
      aria-live="assertive"
    >
      {reminders.map((r, i) => {
        const s = REMINDER_STYLE[r.color] ?? REMINDER_STYLE.grau;
        const isPrimary = i === 0;
        return (
          <div
            key={r.id}
            className={cn(
              "flex w-full max-w-5xl flex-col items-center justify-center gap-4 rounded-3xl px-10 py-8 text-center shadow-2xl",
              !isPrimary && cn("border-4", s.bg, s.text, s.border),
            )}
          >
            {r.emoji && (
              <span
                className={cn("leading-none", isPrimary ? "text-[14rem]" : "text-8xl")}
                aria-hidden
              >
                {r.emoji}
              </span>
            )}
            <span
              className={cn(
                "font-black uppercase tracking-tight",
                isPrimary ? "text-7xl md:text-8xl" : "text-4xl md:text-5xl",
              )}
            >
              {r.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
