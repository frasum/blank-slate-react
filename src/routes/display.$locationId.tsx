// Öffentliche Display-Anzeige. Keine Auth — Zugriff per Token in der URL.
// Holt Daten alle refreshIntervalSeconds vom öffentlichen Endpoint.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { formatShortDate } from "@/lib/format-date";

type ShiftDto = {
  id: string;
  staffName: string;
  area: string;
  skillName: string | null;
  status: string | null;
};

type DisplayPayload = {
  location: { id: string; name: string };
  generatedAt: string;
  refreshIntervalSeconds: number;
  date: string;
  releasedAreas: string[];
  shifts: ShiftDto[];
  rotationEnabled: boolean;
  rotationIntervalSeconds: number;
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

function DisplayPage() {
  const { locationId } = useParams({ from: "/display/$locationId" });
  const { token } = useSearch({ from: "/display/$locationId" });
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [rotIndex, setRotIndex] = useState(0);
  const [rotProgress, setRotProgress] = useState(0);

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

  const groups: { key: string; title: string; shifts: ShiftDto[]; accent: string }[] = (() => {
    if (!data) return [];
    const wanted = data.showAreas;
    const all = [
      {
        key: "kitchen",
        title: "Küche",
        shifts: data.shifts.filter((s) => s.area === "kitchen"),
        accent: "bg-orange-500/10 border-orange-500/30",
      },
      {
        key: "service",
        title: "Service",
        shifts: data.shifts.filter((s) => s.area === "service"),
        accent: "bg-sky-500/10 border-sky-500/30",
      },
      {
        key: "gl",
        title: "Sonstige",
        shifts: data.shifts.filter((s) => s.area !== "kitchen" && s.area !== "service"),
        accent: "bg-slate-500/10 border-slate-500/30",
      },
    ];
    return all.filter((g) => (wanted ? wanted.includes(g.key) : true));
  })();

  const rotIntervalMs = Math.max(1000, (data?.rotationIntervalSeconds ?? 30) * 1000);
  const rotationActive = !!data && data.rotationEnabled && groups.length > 1;

  useEffect(() => {
    if (!rotationActive) {
      setRotProgress(0);
      return;
    }
    const step = 100 / (rotIntervalMs / 100);
    const t = setInterval(() => {
      setRotProgress((p) => {
        const next = p + step;
        if (next >= 100) {
          setRotIndex((i) => (i + 1) % groups.length);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(t);
  }, [rotationActive, rotIntervalMs, groups.length]);

  useEffect(() => {
    if (rotIndex >= groups.length) setRotIndex(0);
  }, [groups.length, rotIndex]);

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
            <p className="mt-1 text-lg text-slate-400">{formatShortDate(data.date)}</p>
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

      <main className="p-10">
        {rotationActive ? (
          <div className="space-y-4">
            <RotationColumn
              group={groups[rotIndex] ?? groups[0]}
              releasedAreas={data.releasedAreas}
            />
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-slate-200 transition-[width] duration-100"
                style={{ width: `${Math.min(100, rotProgress)}%` }}
              />
            </div>
            <div className="flex justify-center gap-2">
              {groups.map((g, i) => (
                <span
                  key={g.key}
                  className={`h-2 w-2 rounded-full ${i === rotIndex ? "bg-slate-200" : "bg-slate-700"}`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-8 ${groups.length > 1 ? "md:grid-cols-2" : ""}`}>
            {groups.map((g) => (
              <RotationColumn key={g.key} group={g} releasedAreas={data.releasedAreas} />
            ))}
          </div>
        )}
      </main>

      {data.showFooter && (
        <footer className="border-t border-slate-800 px-10 py-4 text-center text-sm text-slate-400">
          <span className="font-medium text-slate-300">Legende:</span> X = Service · B = Bar · GL =
          Geschäftsleitung · H = Hausmeister · 19h = ab 19 Uhr
        </footer>
      )}
    </div>
  );
}

function RotationColumn({
  group,
  releasedAreas,
}: {
  group: { key: string; title: string; shifts: ShiftDto[]; accent: string };
  releasedAreas: string[];
}) {
  if (group.key === "kitchen" && !releasedAreas.includes("kitchen")) {
    return (
      <PlaceholderColumn
        title="Küche"
        accent={group.accent}
        message="Küche – noch nicht freigegeben"
      />
    );
  }
  if (group.key === "service" && !releasedAreas.includes("service")) {
    return (
      <PlaceholderColumn
        title="Service"
        accent={group.accent}
        message="Service – noch nicht freigegeben"
      />
    );
  }
  return <Column title={group.title} shifts={group.shifts} accent={group.accent} />;
}

function PlaceholderColumn({
  title,
  accent,
  message,
}: {
  title: string;
  accent: string;
  message: string;
}) {
  return (
    <section className={`rounded-2xl border p-6 ${accent}`}>
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      <p className="text-xl text-slate-400">{message}</p>
    </section>
  );
}

function Column({ title, shifts, accent }: { title: string; shifts: ShiftDto[]; accent: string }) {
  return (
    <section className={`rounded-2xl border p-6 ${accent}`}>
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      {shifts.length === 0 ? (
        <p className="text-slate-400">Keine Schichten heute.</p>
      ) : (
        <ul className="space-y-2">
          {shifts.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg bg-slate-900/60 px-4 py-3"
            >
              <span className="text-2xl font-medium">{s.staffName}</span>
              {s.skillName && (
                <span className="rounded-md bg-slate-800 px-3 py-1 text-sm uppercase tracking-wide text-slate-300">
                  {s.skillName}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
