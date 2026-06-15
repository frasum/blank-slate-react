// Öffentliche Display-Anzeige. Keine Auth — Zugriff per Token in der URL.
// Holt Daten alle refreshIntervalSeconds vom öffentlichen Endpoint.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

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
  shifts: ShiftDto[];
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
function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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

  const kitchen = data.shifts.filter((s) => s.area === "kitchen");
  const service = data.shifts.filter((s) => s.area === "service");
  const other = data.shifts.filter((s) => s.area !== "kitchen" && s.area !== "service");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-10 py-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{data.location.name}</h1>
          <p className="mt-1 text-lg text-slate-400">{formatDate(data.date)}</p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-mono font-semibold tabular-nums">{formatTime(now)}</div>
          {error && <p className="mt-1 text-sm text-amber-400">{error}</p>}
        </div>
      </header>

      <main className="grid grid-cols-1 gap-8 p-10 md:grid-cols-2">
        <Column title="Küche" shifts={kitchen} accent="bg-orange-500/10 border-orange-500/30" />
        <Column title="Service" shifts={service} accent="bg-sky-500/10 border-sky-500/30" />
        {other.length > 0 && (
          <Column
            title="Sonstige"
            shifts={other}
            accent="bg-slate-500/10 border-slate-500/30"
          />
        )}
      </main>
    </div>
  );
}

function Column({
  title,
  shifts,
  accent,
}: {
  title: string;
  shifts: ShiftDto[];
  accent: string;
}) {
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