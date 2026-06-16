// Organisations-Einstellungen (admin only zum Schreiben, manager liest).
// Aktuell verwaltet:
//   * Küchen-Trinkgeldsatz (Anteil des Service-Bruttoumsatzes als Küchenpool)
//   * Mindeststunden pro Geschäftstag für die Trinkgeldpool-Teilnahme
//
// Geld-Wirkung: Änderungen wirken auf alle zukünftigen Pool-Berechnungen
// derselben Organisation. Bestehende waiter_settlements behalten ihre
// gespeicherte kitchen_tip_rate (siehe cash.functions Z. 9).

import { useEffect, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgSettings, updateOrgSettings } from "@/lib/admin/org-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
  head: () => ({ meta: [{ title: "Einstellungen · Verwaltung" }] }),
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const canEdit = identity.role === "admin";
  const queryClient = useQueryClient();
  const callUpdate = useServerFn(updateOrgSettings);

  const settingsQ = useQuery({
    queryKey: ["admin", "org-settings"],
    queryFn: () => getOrgSettings(),
  });

  // Eingaben als String, damit der User „2,50" tippen kann ohne dass jede
  // Tastatureingabe Number-parsiert wird (Komma → Punkt erst beim Speichern).
  const [tipRatePercent, setTipRatePercent] = useState("");
  const [minHours, setMinHours] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setTipRatePercent((settingsQ.data.kitchenTipRate * 100).toFixed(2));
    setMinHours(settingsQ.data.tipPoolMinHours.toFixed(2));
  }, [settingsQ.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const rate = parseLocaleNumber(tipRatePercent) / 100;
      const hours = parseLocaleNumber(minHours);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new Error("Küchen-Trinkgeldsatz: 0 bis 100 % erlaubt.");
      }
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        throw new Error("Mindeststunden: 0 bis 24 erlaubt.");
      }
      return callUpdate({
        data: { kitchenTipRate: rate, tipPoolMinHours: hours },
      });
    },
    onSuccess: async () => {
      setMsg("Gespeichert.");
      setErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : "Fehler.");
      setMsg(null);
    },
  });

  if (settingsQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (settingsQ.error)
    return <p className="text-sm text-destructive">Einstellungen konnten nicht geladen werden.</p>;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisationsweite Geschäftsregeln. {canEdit ? "Nur Admin darf ändern." : "Nur lesen."}
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Trinkgeldpool</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Regeln für Aufteilung und Teilnahme am Trinkgeldpool.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            setErr(null);
            mutation.mutate();
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Küchen-Trinkgeldsatz (% vom Service-Bruttoumsatz)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={tipRatePercent}
              onChange={(e) => setTipRatePercent(e.target.value)}
              disabled={!canEdit}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            <span className="ml-2 text-xs text-muted-foreground">z. B. 2,00 = 2 %</span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Mindeststunden pro Geschäftstag für Trinkgeldpool
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={minHours}
              onChange={(e) => setMinHours(e.target.value)}
              disabled={!canEdit}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            <span className="ml-2 text-xs text-muted-foreground">
              Tagessumme, inklusive Grenze (2,50 = 2:30 zählt mit, 2:29 nicht)
            </span>
          </label>

          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          {err && <p className="text-xs text-destructive">{err}</p>}

          {canEdit && (
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {mutation.isPending ? "Speichern…" : "Speichern"}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

function parseLocaleNumber(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return NaN;
  return Number(normalized);
}