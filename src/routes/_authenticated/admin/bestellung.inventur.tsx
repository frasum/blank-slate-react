// Inventur (Welle 2). Pro Standort eine Session. Manager+ darf zählen.
// UI: Standortwahl + neue Inventur, Liste vergangener Inventuren,
// in offener Session: Tabelle aller aktiven Artikel mit zwei Lager-Inputs,
// debounced autosave per Zeile, Live-Summen, Abschluss-Button.

import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatShortDateTime } from "@/lib/format-date";
import {
  completeInventorySession,
  createInventorySession,
  getInventorySession,
  listInventorySessions,
  upsertInventoryItem,
} from "@/lib/bestellung/inventory.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";

export const Route = createFileRoute("/_authenticated/admin/bestellung/inventur")({
  head: () => ({ meta: [{ title: "Inventur · Bestellung" }] }),
  component: InventurPage,
});

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (Number(cents) / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function parseQty(value: string): number {
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function InventurPage() {
  const qc = useQueryClient();
  const callCreate = useServerFn(createInventorySession);
  const callComplete = useServerFn(completeInventorySession);

  const [locationId, setLocationId] = useState<string>("");
  // Manuell geschlossene Session-IDs: damit der „Schließen"-Button die laufende
  // Inventur ausblendet, ohne dass sie beim nächsten Render wieder auto-geöffnet wird.
  const [hiddenSessionIds, setHiddenSessionIds] = useState<string[]>([]);
  const [manualOpenId, setManualOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const locationsQ = useQuery({
    queryKey: ["inventur", "locations"],
    queryFn: () => listLocations(),
  });

  useEffect(() => {
    if (!locationId && locationsQ.data && locationsQ.data.length > 0) {
      setLocationId(locationsQ.data[0].id);
    }
  }, [locationsQ.data, locationId]);

  const sessionsQ = useQuery({
    queryKey: ["inventur", "sessions", locationId],
    queryFn: () => listInventorySessions({ data: locationId ? { locationId } : {} }),
    enabled: !!locationId,
  });

  // Auto-pick laufende Inventur, damit sie auch nach Seitenwechsel sichtbar bleibt.
  const runningSession = (sessionsQ.data ?? []).find(
    (s) => s.status === "in_progress" && !hiddenSessionIds.includes(s.id),
  );
  const openSessionId = manualOpenId ?? runningSession?.id ?? null;

  const createMut = useMutation({
    mutationFn: () => callCreate({ data: { locationId } }),
    onSuccess: (r) => {
      setHiddenSessionIds((ids) => ids.filter((id) => id !== r.id));
      setManualOpenId(r.id);
      qc.invalidateQueries({ queryKey: ["inventur", "sessions"] });
      setMsg("Neue Inventur gestartet.");
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const completeMut = useMutation({
    mutationFn: (sessionId: string) => callComplete({ data: { sessionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventur", "sessions"] });
      qc.invalidateQueries({ queryKey: ["inventur", "session"] });
      setMsg("Inventur abgeschlossen.");
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm text-foreground">{msg}</p>}

      <section className="rounded-md border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1 text-xs">
            <span className="block uppercase tracking-wide text-muted-foreground">Standort</span>
            <LocationPills
              locations={locationsQ.data ?? []}
              value={locationId}
              onChange={(v: string) => {
                setLocationId(v);
                setManualOpenId(null);
              }}
            />
          </div>
          <div className="flex items-end">
            <button
              disabled={!locationId || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              + Neue Inventur
            </button>
          </div>
        </div>
      </section>

      {openSessionId && (
        <OpenSession
          sessionId={openSessionId}
          onClose={() => {
            setHiddenSessionIds((ids) =>
              ids.includes(openSessionId) ? ids : [...ids, openSessionId],
            );
            setManualOpenId(null);
          }}
          onComplete={() => completeMut.mutate(openSessionId)}
          completing={completeMut.isPending}
        />
      )}

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Inventuren
        </div>
        {sessionsQ.isLoading && <p className="px-3 py-3 text-sm text-muted-foreground">Lädt …</p>}
        {!sessionsQ.isLoading && (sessionsQ.data ?? []).length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">Keine Inventuren bisher.</p>
        )}
        <table className="w-full text-sm">
          <tbody>
            {(sessionsQ.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShortDateTime(s.created_at)}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs">
                  <span
                    className={
                      s.status === "completed"
                        ? "rounded bg-muted px-2 py-0.5 text-muted-foreground"
                        : "rounded bg-primary/10 px-2 py-0.5 text-primary"
                    }
                  >
                    {s.status === "completed" ? "Abgeschlossen" : "Läuft"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {fmtEuro(Number(s.total_value_cents))}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => {
                      setHiddenSessionIds((ids) => ids.filter((id) => id !== s.id));
                      setManualOpenId(s.id);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Öffnen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function OpenSession({
  sessionId,
  onClose,
  onComplete,
  completing,
}: {
  sessionId: string;
  onClose: () => void;
  onComplete: () => void;
  completing: boolean;
}) {
  const qc = useQueryClient();
  const callUpsert = useServerFn(upsertInventoryItem);

  const sessionQ = useQuery({
    queryKey: ["inventur", "session", sessionId],
    queryFn: () => getInventorySession({ data: { sessionId } }),
  });

  const upsertMut = useMutation({
    mutationFn: (input: { articleId: string; storage1: number; storage2: number }) =>
      callUpsert({ data: { sessionId, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventur", "session", sessionId] });
      qc.invalidateQueries({ queryKey: ["inventur", "sessions"] });
    },
  });

  if (sessionQ.isLoading) {
    return (
      <section className="rounded-md border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Lädt Inventur …</p>
      </section>
    );
  }

  const data = sessionQ.data;
  if (!data) return null;
  const readOnly = data.session.status === "completed";

  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div>
          <p className="font-medium text-foreground">{data.session.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatShortDateTime(data.session.created_at)}
            {readOnly && data.session.completed_at
              ? ` · abgeschlossen ${formatShortDateTime(data.session.completed_at)}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm">
            Warenwert:{" "}
            <span className="font-mono font-medium text-foreground">
              {fmtEuro(Number(data.session.total_value_cents))}
            </span>
          </p>
          {!readOnly && (
            <button
              onClick={onComplete}
              disabled={completing}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {completing ? "Schließe …" : "Inventur abschließen"}
            </button>
          )}
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Schließen
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Artikel</th>
              <th className="px-3 py-2">Inventureinheit</th>
              <th className="px-3 py-2 text-right">Einzelwert</th>
              <th className="px-3 py-2 text-center">Bar</th>
              <th className="px-3 py-2 text-center">Trockenlager</th>
              <th className="px-3 py-2 text-right">Gesamt</th>
              <th className="px-3 py-2 text-right">Gesamtwert</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <ArticleRow
                key={row.article.id}
                article={row.article}
                item={row.item}
                readOnly={readOnly}
                onSave={(s1, s2) =>
                  upsertMut.mutate({ articleId: row.article.id, storage1: s1, storage2: s2 })
                }
              />
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">Keine aktiven Artikel.</p>
        )}
      </div>
    </section>
  );
}

function ArticleRow({
  article,
  item,
  readOnly,
  onSave,
}: {
  article: {
    id: string;
    name: string;
    unit: string;
    price_cents: number;
    order_unit?: string;
    inventory_unit?: string;
    order_to_inventory_factor?: number;
  };
  item: {
    storage_1: number;
    storage_2: number;
    total_qty: number;
    line_value_cents: number;
    article_name_snapshot?: string | null;
    inventory_unit_snapshot?: string | null;
    normalized_price_per_inventory_unit_cents?: number | null;
  } | null;
  readOnly: boolean;
  onSave: (s1: number, s2: number) => void;
}) {
  const [s1, setS1] = useState<string>(item ? String(item.storage_1) : "0");
  const [s2, setS2] = useState<string>(item ? String(item.storage_2) : "0");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(true);

  // Refresh local state when server values change (after save invalidation).
  useEffect(() => {
    if (item) {
      setS1(String(item.storage_1));
      setS2(String(item.storage_2));
    }
  }, [item, item?.storage_1, item?.storage_2]);

  // Snapshot-first: bei abgeschlossenen Zeilen Anzeige aus Snapshot, sonst live.
  const displayName = (readOnly && item?.article_name_snapshot) || article.name;
  const invUnit =
    (readOnly && item?.inventory_unit_snapshot) || article.inventory_unit || article.unit;
  const factor = article.order_to_inventory_factor ?? 1;
  const normalizedPerUnit =
    readOnly && item?.normalized_price_per_inventory_unit_cents != null
      ? Number(item.normalized_price_per_inventory_unit_cents)
      : article.price_cents / (factor || 1);
  const qty = parseQty(s1) + parseQty(s2);
  const liveValue = readOnly && item ? item.line_value_cents : Math.round(qty * normalizedPerUnit);

  function schedule(nextS1: string, nextS2: string) {
    if (readOnly) return;
    if (initial.current) {
      initial.current = false;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onSave(parseQty(nextS1), parseQty(nextS2));
    }, 600);
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">{displayName}</td>
      <td className="px-3 py-2 text-muted-foreground">{invUnit}</td>
      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
        {(normalizedPerUnit / 100).toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })}{" "}
        €
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="text"
          inputMode="decimal"
          value={s1}
          disabled={readOnly}
          onChange={(e) => {
            setS1(e.target.value);
            schedule(e.target.value, s2);
          }}
          className="w-20 rounded border border-input bg-background px-2 py-1 text-center text-sm disabled:opacity-60"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="text"
          inputMode="decimal"
          value={s2}
          disabled={readOnly}
          onChange={(e) => {
            setS2(e.target.value);
            schedule(s1, e.target.value);
          }}
          className="w-20 rounded border border-input bg-background px-2 py-1 text-center text-sm disabled:opacity-60"
        />
      </td>
      <td className="px-3 py-2 text-right font-mono">{qty.toLocaleString("de-DE")}</td>
      <td className="px-3 py-2 text-right font-mono">{fmtEuro(liveValue)}</td>
    </tr>
  );
}
