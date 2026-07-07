// RT1 — Betriebskalender pro Standort: Wochentags-Ruhetage + Kalender-Ausnahmen.
// Wird in der ausgeklappten Standort-Zeile (Stammdaten → Standorte) gerendert.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteCalendarException,
  getLocationCalendar,
  setRestDays,
  upsertCalendarException,
} from "@/lib/roster/business-calendar.functions";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 7, label: "So" },
];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LocationCalendarPanel({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const callSetRest = useServerFn(setRestDays);
  const callUpsert = useServerFn(upsertCalendarException);
  const callDelete = useServerFn(deleteCalendarException);

  const q = useQuery({
    queryKey: ["location-calendar", locationId],
    queryFn: () => getLocationCalendar({ data: { locationId } }),
  });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) setSelected(new Set(q.data.restWeekdays));
  }, [q.data]);

  const dirty = useMemo(() => {
    const cur = q.data?.restWeekdays ?? [];
    if (cur.length !== selected.size) return true;
    for (const v of cur) if (!selected.has(v)) return true;
    return false;
  }, [q.data, selected]);

  const restMut = useMutation({
    mutationFn: () =>
      callSetRest({ data: { locationId, weekdays: Array.from(selected).sort((a, b) => a - b) } }),
    onSuccess: async () => {
      setMsg("Ruhetage gespeichert.");
      await qc.invalidateQueries({ queryKey: ["location-calendar", locationId] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const [newDate, setNewDate] = useState<string>(isoToday());
  const [newKind, setNewKind] = useState<"closed" | "open">("closed");
  const [newReason, setNewReason] = useState<string>("");

  const upsertMut = useMutation({
    mutationFn: () =>
      callUpsert({
        data: {
          locationId,
          date: newDate,
          kind: newKind,
          reason: newReason.trim() || null,
        },
      }),
    onSuccess: async () => {
      setNewReason("");
      setMsg("Ausnahme gespeichert.");
      await qc.invalidateQueries({ queryKey: ["location-calendar", locationId] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => callDelete({ data: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["location-calendar", locationId] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  function toggleDay(v: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  return (
    <div className="mt-3 space-y-4 rounded-md border border-input bg-muted/30 p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Betriebskalender
      </p>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Wiederkehrende Ruhetage (Standort ist an diesen Wochentagen geschlossen).
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((w) => {
            const on = selected.has(w.value);
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleDay(w.value)}
                className={
                  "rounded-md border px-3 py-1.5 text-sm " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent")
                }
              >
                {w.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!dirty || restMut.isPending}
          onClick={() => restMut.mutate()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {restMut.isPending ? "Speichern…" : "Ruhetage speichern"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Ausnahmen (einmalig)</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Datum</span>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Art</span>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as "closed" | "open")}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="closed">Geschlossen</option>
              <option value="open">Geöffnet (überschreibt Ruhetag)</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Grund (optional)</span>
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              maxLength={200}
              placeholder="Betriebsferien / Sonderöffnung"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={upsertMut.isPending || !newDate}
            onClick={() => upsertMut.mutate()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Hinzufügen
          </button>
        </div>

        {q.isLoading ? (
          <p className="text-xs text-muted-foreground">Lade…</p>
        ) : (q.data?.exceptions ?? []).length === 0 ? (
          <p className="text-xs italic text-muted-foreground">Keine Ausnahmen hinterlegt.</p>
        ) : (
          <ul className="divide-y divide-input rounded-md border border-input bg-background">
            {q.data!.exceptions.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{ex.date}</span> ·{" "}
                  {ex.kind === "closed" ? "Geschlossen" : "Geöffnet"}
                  {ex.reason ? <span className="text-muted-foreground"> — {ex.reason}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(ex.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
