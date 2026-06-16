// Welle 4-C — EasyOrder Mitarbeiter-UI.
// Touch-freundliche Bestell-Oberfläche für PIN-eingeloggte Mitarbeiter.
// Konsumiert ausschliesslich die 4-B Server-Funktionen
// (getMyEasyOrderContext, getEasyOrderCatalog, placeEasyOrder).
// Alle Berechtigungen werden serverseitig geprüft — diese UI hat
// keine eigene Sicherheitslogik.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEasyOrderCatalog,
  getMyEasyOrderContext,
  placeEasyOrder,
  type EasyOrderCatalogArticle,
  type EasyOrderFreeTextInput,
} from "@/lib/bestellung/easyorder.functions";
import { getCurrentPosition } from "@/lib/geo/client";

export const Route = createFileRoute("/_authenticated/admin/bestellung/easyorder")({
  head: () => ({ meta: [{ title: "EasyOrder · Bestellung" }] }),
  component: EasyOrderPage,
});

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function EasyOrderPage() {
  const callPlace = useServerFn(placeEasyOrder);

  const ctxQ = useQuery({
    queryKey: ["easyorder", "context"],
    queryFn: () => getMyEasyOrderContext(),
  });

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const locations = ctxQ.data?.locations ?? [];
  const effectiveLocationId =
    selectedLocationId ?? (locations.length === 1 ? locations[0].locationId : null);
  const selectedLocation = locations.find((l) => l.locationId === effectiveLocationId) ?? null;

  if (ctxQ.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Lädt …</p>;
  }
  if (ctxQ.error) {
    return (
      <p className="p-6 text-sm text-destructive">
        Fehler: {ctxQ.error instanceof Error ? ctxQ.error.message : "Unbekannt"}
      </p>
    );
  }

  // State 0 — kein Zugang
  if (!ctxQ.data?.hasEasyOrder) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="mb-2 text-xl font-semibold text-foreground">Kein Zugriff</h2>
        <p className="text-sm text-muted-foreground">
          Du bist nicht für EasyOrder freigeschaltet. Bitte wende dich an deine Leitung.
        </p>
      </div>
    );
  }

  // State 1 — Location wählen
  if (!effectiveLocationId) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Wo bestellst du?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {locations.map((l) => (
            <button
              key={l.locationId}
              onClick={() => setSelectedLocationId(l.locationId)}
              className="rounded-lg border border-border bg-card p-6 text-left text-lg font-medium text-foreground transition hover:border-primary hover:bg-accent"
            >
              {l.locationName}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <EasyOrderCart
      locationId={effectiveLocationId}
      locationName={selectedLocation?.locationName ?? ""}
      canAddFreeItems={selectedLocation?.canAddFreeItems ?? false}
      canSwitchLocation={locations.length > 1}
      onSwitchLocation={() => setSelectedLocationId(null)}
      callPlace={callPlace}
    />
  );
}

type CallPlaceFn = ReturnType<typeof useServerFn<typeof placeEasyOrder>>;

function EasyOrderCart(props: {
  locationId: string;
  locationName: string;
  canAddFreeItems: boolean;
  canSwitchLocation: boolean;
  onSwitchLocation: () => void;
  callPlace: CallPlaceFn;
}) {
  const {
    locationId,
    locationName,
    canAddFreeItems,
    canSwitchLocation,
    onSwitchLocation,
    callPlace,
  } = props;

  const catalogQ = useQuery({
    queryKey: ["easyorder", "catalog", locationId],
    queryFn: () => getEasyOrderCatalog({ data: { locationId } }),
  });

  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [freeItems, setFreeItems] = useState<EasyOrderFreeTextInput[]>([]);
  const [ftOpen, setFtOpen] = useState(false);
  const [ftSupplier, setFtSupplier] = useState("");
  const [ftName, setFtName] = useState("");
  const [ftUnit, setFtUnit] = useState("Stk");
  const [ftQty, setFtQty] = useState(1);
  const [successInfo, setSuccessInfo] = useState<{
    count: number;
    autoSendAttempted: boolean;
    sendOk: number;
    sendFailed: number;
    failures: { orderId: string; error?: string }[];
  } | null>(null);

  const placeMut = useMutation({
    mutationFn: async (input: Parameters<typeof callPlace>[0]) => {
      const fix = await getCurrentPosition();
      return callPlace({ data: { ...input.data, geo: fix } });
    },
    onSuccess: (res) => {
      setSuccessInfo({
        count: res.orderIds.length,
        autoSendAttempted: res.autoSendAttempted,
        sendOk: res.sendResults.filter((r) => r.ok).length,
        sendFailed: res.sendResults.filter((r) => !r.ok).length,
        failures: res.sendResults
          .filter((r) => !r.ok)
          .map((r) => ({ orderId: r.orderId, error: r.error })),
      });
      setQty({});
      setFreeItems([]);
      setNotes("");
    },
  });

  const articles = useMemo(() => catalogQ.data?.articles ?? [], [catalogQ.data?.articles]);

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of articles) {
      if (a.supplierId) m.set(a.supplierId, a.supplierName);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [articles]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return articles;
    return articles.filter(
      (a) => a.name.toLowerCase().includes(s) || (a.sku ?? "").toLowerCase().includes(s),
    );
  }, [articles, search]);

  const groups = useMemo(() => {
    const m = new Map<string, { supplierName: string; rows: EasyOrderCatalogArticle[] }>();
    for (const a of filtered) {
      const key = a.supplierName || "—";
      const g = m.get(key) ?? { supplierName: key, rows: [] };
      g.rows.push(a);
      m.set(key, g);
    }
    return Array.from(m.values()).sort((x, y) => x.supplierName.localeCompare(y.supplierName));
  }, [filtered]);

  const catalogQtyCount = Object.values(qty).reduce((s, q) => s + (q > 0 ? q : 0), 0);
  const totalItems = catalogQtyCount + freeItems.reduce((s, fi) => s + fi.quantity, 0);
  // Server-Validierung (zod) verlangt mindestens 1 Katalog-Artikel.
  const cartEmpty = catalogQtyCount === 0;

  const setItemQty = (articleId: string, next: number) => {
    const n = Math.max(0, Math.min(9999, Math.floor(next)));
    setQty((prev) => {
      const copy = { ...prev };
      if (n === 0) delete copy[articleId];
      else copy[articleId] = n;
      return copy;
    });
  };

  const submit = () => {
    setSuccessInfo(null);
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([articleId, quantity]) => ({ articleId, quantity }));
    if (items.length === 0) return;
    placeMut.mutate({
      data: {
        locationId,
        items,
        freeTextItems: freeItems.length > 0 ? freeItems : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      },
    });
  };

  if (catalogQ.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Lädt Katalog …</p>;
  }
  if (catalogQ.error) {
    return (
      <p className="p-6 text-sm text-destructive">
        Fehler: {catalogQ.error instanceof Error ? catalogQ.error.message : "Unbekannt"}
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Standort</p>
          <p className="text-lg font-semibold text-foreground">{locationName}</p>
        </div>
        {canSwitchLocation && (
          <button
            onClick={onSwitchLocation}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
          >
            Standort wechseln
          </button>
        )}
      </div>

      {successInfo && (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-4 text-foreground">
          <p className="text-base font-semibold">
            {successInfo.autoSendAttempted && successInfo.sendFailed === 0
              ? "Bestellung an Lieferant versendet ✓"
              : "Bestellung angelegt ✓"}
          </p>
          <p className="text-sm text-muted-foreground">
            {successInfo.count} {successInfo.count === 1 ? "Bestellung" : "Bestellungen"} angelegt
            (eine pro Lieferant).
          </p>
          {successInfo.autoSendAttempted ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Mailversand: {successInfo.sendOk} erfolgreich
              {successInfo.sendFailed > 0 ? `, ${successInfo.sendFailed} fehlgeschlagen` : ""}.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Wird vom Admin in der Lieferanten-Übersicht versendet.
            </p>
          )}
          {successInfo.failures.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-destructive">
              {successInfo.failures.map((f) => (
                <li key={f.orderId}>{f.error ?? "Versand fehlgeschlagen."}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setSuccessInfo(null)}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Neue Bestellung
          </button>
        </div>
      )}

      {placeMut.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {placeMut.error instanceof Error ? placeMut.error.message : "Fehler beim Absenden."}
        </div>
      )}

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Artikel suchen …"
        className="w-full rounded-md border border-input bg-background px-4 py-3 text-base"
      />

      {/* Free-text trigger */}
      {canAddFreeItems && (
        <div className="rounded-md border border-border bg-card p-3">
          <button
            onClick={() => setFtOpen((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Sonstiger Artikel
          </button>
          {ftOpen && (
            <div className="mt-3 space-y-2">
              <select
                value={ftSupplier}
                onChange={(e) => setFtSupplier(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              >
                <option value="">Lieferant wählen …</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                value={ftName}
                onChange={(e) => setFtName(e.target.value)}
                placeholder="Artikelname"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              />
              <div className="flex gap-2">
                <input
                  value={ftUnit}
                  onChange={(e) => setFtUnit(e.target.value)}
                  placeholder="Einheit"
                  className="w-24 rounded-md border border-input bg-background px-3 py-2 text-base"
                />
                <Stepper value={ftQty} onChange={(n) => setFtQty(Math.max(1, n))} min={1} />
                <button
                  disabled={!ftSupplier || !ftName.trim()}
                  onClick={() => {
                    setFreeItems((prev) => [
                      ...prev,
                      {
                        supplierId: ftSupplier,
                        name: ftName.trim(),
                        unit: ftUnit.trim() || "Stk",
                        quantity: ftQty,
                      },
                    ]);
                    setFtName("");
                    setFtQty(1);
                    setFtOpen(false);
                  }}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Übernehmen
                </button>
              </div>
            </div>
          )}
          {freeItems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {freeItems.map((fi, idx) => {
                const sup = suppliers.find((s) => s.id === fi.supplierId);
                return (
                  <li
                    key={`${fi.supplierId}-${fi.name}-${idx}`}
                    className="flex items-center justify-between rounded border border-border bg-background px-3 py-2"
                  >
                    <span>
                      {fi.quantity} {fi.unit ?? "Stk"} · {fi.name}{" "}
                      <span className="text-xs text-muted-foreground">({sup?.name ?? "?"})</span>
                    </span>
                    <button
                      onClick={() => setFreeItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-destructive hover:underline"
                    >
                      Entfernen
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Catalog grouped by supplier */}
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Artikel gefunden.</p>
      )}
      <div className="space-y-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.supplierName] ?? false;
          return (
            <div key={g.supplierName} className="rounded-md border border-border bg-card">
              <button
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [g.supplierName]: !isCollapsed }))
                }
                className="flex w-full items-center justify-between border-b border-border bg-muted/30 px-4 py-3 text-left"
              >
                <span className="font-semibold text-foreground">{g.supplierName}</span>
                <span className="text-xs text-muted-foreground">
                  {g.rows.length} Artikel {isCollapsed ? "▸" : "▾"}
                </span>
              </button>
              {!isCollapsed && (
                <ul>
                  {g.rows.map((a) => {
                    const n = qty[a.id] ?? 0;
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-medium text-foreground">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.unit ?? "Stk"} · {fmtEuro(a.priceCents)}
                            {n > 0 && (
                              <span className="ml-2">
                                = <span className="font-mono">{fmtEuro(a.priceCents * n)}</span>
                              </span>
                            )}
                          </p>
                        </div>
                        <Stepper value={n} onChange={(next) => setItemQty(a.id, next)} min={0} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          Anmerkung (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
      </div>

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm">
            <span className="font-semibold text-foreground">{totalItems}</span>{" "}
            <span className="text-muted-foreground">Artikel im Warenkorb</span>
          </span>
          <button
            disabled={cartEmpty || placeMut.isPending}
            onClick={submit}
            className="min-h-[44px] rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {placeMut.isPending ? "Sende …" : "Bestellung absenden"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper(props: { value: number; onChange: (next: number) => void; min?: number }) {
  const { value, onChange, min = 0 } = props;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-11 w-11 items-center justify-center rounded-md border border-input bg-background text-xl font-semibold hover:bg-accent disabled:opacity-40"
        aria-label="Weniger"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={9999}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? n : min);
        }}
        className="h-11 w-14 rounded-md border border-input bg-background text-center text-base font-semibold"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(9999, value + 1))}
        className="flex h-11 w-11 items-center justify-center rounded-md border border-input bg-background text-xl font-semibold hover:bg-accent"
        aria-label="Mehr"
      >
        +
      </button>
    </div>
  );
}
