// Wein-Katalog (Welle 3-A). Eigene Sicht auf Artikel mit category = 'Wein'.
// Nutzt dieselben Server-Mutations wie der Artikel-Tab, nur mit gesetzter
// Kategorie und den Wein-Zusatzfeldern.

import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createArticle,
  listArticles,
  setArticleActive,
  updateArticle,
} from "@/lib/bestellung/articles.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  researchWine,
  researchWineById,
  type WineResearchBatchItem,
} from "@/lib/bestellung/wine-research.functions";
import { parseEuroToCents } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/bestellung/wein")({
  head: () => ({ meta: [{ title: "Wein · Bestellung" }] }),
  component: WeinPage,
});

const SPECIAL_ATTRS = ["Bio", "Vegan", "Biodynamisch", "Demeter", "Alte Reben"] as const;

const BATCH_FIELDS = [
  "grapeVariety",
  "originCountry",
  "foodPairings",
  "description",
  "specialAttributes",
] as const;
type BatchField = (typeof BATCH_FIELDS)[number];

const FIELD_LABEL: Record<BatchField, string> = {
  grapeVariety: "Rebsorte",
  originCountry: "Herkunft",
  foodPairings: "Speisen",
  description: "Beschreibung",
  specialAttributes: "Merkmale",
};

function sameStr(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
function sameAttrs(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function defaultSelection(item: WineResearchBatchItem): Record<BatchField, boolean> {
  const s = item.suggestion;
  const c = item.current;
  const pickText = (cur: string, sug: string) => {
    if (!sug.trim()) return false; // nichts vorzuschlagen
    if (!cur.trim()) return true; // leer → default an
    if (sameStr(cur, sug)) return false; // identisch → nichts zu tun
    return false; // Konflikt → aus, Frank muss aktiv wählen
  };
  const pickAttrs = (cur: string[], sug: string[]) => {
    if (sug.length === 0) return false;
    if (cur.length === 0) return true;
    if (sameAttrs(cur, sug)) return false;
    return false;
  };
  if (!s) {
    return {
      grapeVariety: false,
      originCountry: false,
      foodPairings: false,
      description: false,
      specialAttributes: false,
    };
  }
  return {
    grapeVariety: pickText(c.grapeVariety, s.grapeVariety),
    originCountry: pickText(c.originCountry, s.originCountry),
    foodPairings: pickText(c.foodPairings, s.foodPairings),
    description: pickText(c.description, s.description),
    specialAttributes: pickAttrs(c.specialAttributes, s.specialAttributes),
  };
}

type WineDraft = {
  id?: string;
  supplierId: string;
  name: string;
  priceEuro: string;
  unit: string;
  description: string;
  grapeVariety: string;
  originCountry: string;
  foodPairings: string;
  specialAttributes: string[];
  imageUrl: string;
};

function emptyDraft(supplierId = ""): WineDraft {
  return {
    supplierId,
    name: "",
    priceEuro: "",
    unit: "Fl",
    description: "",
    grapeVariety: "",
    originCountry: "",
    foodPairings: "",
    specialAttributes: [],
    imageUrl: "",
  };
}

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

function WeinPage() {
  const qc = useQueryClient();
  const callCreate = useServerFn(createArticle);
  const callUpdate = useServerFn(updateArticle);
  const callToggle = useServerFn(setArticleActive);
  const callBatchResearch = useServerFn(researchWineById);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Welle 3-B — Batch-Recherche State (siehe .lovable/plan.md).
  type BatchEntry = {
    item: WineResearchBatchItem;
    selected: Record<BatchField, boolean>;
  };
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
    current: string;
  } | null>(null);
  const [batchResults, setBatchResults] = useState<Map<string, BatchEntry>>(new Map());
  const [batchApplying, setBatchApplying] = useState(false);
  const [batchApplyMsg, setBatchApplyMsg] = useState<string | null>(null);
  // Status der Batch-Recherche selbst (Läuft/Abgebrochen/Fertig/Fehlgeschlagen).
  type BatchStatus = "idle" | "running" | "cancelled" | "done" | "failed";
  const [batchStatus, setBatchStatus] = useState<BatchStatus>("idle");
  const cancelRef = useRef(false);

  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: true }],
    queryFn: () => listSuppliers({ data: { includeInactive: true } }),
  });

  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
  });
  const allLocationIds = useMemo(() => (locationsQ.data ?? []).map((l) => l.id), [locationsQ.data]);

  const winesQ = useQuery({
    queryKey: ["bestellung", "wines", { search, includeInactive: showInactive }],
    queryFn: () =>
      listArticles({
        data: {
          onlyWine: true,
          search: search.trim() || undefined,
          includeInactive: showInactive,
        },
      }),
  });

  const suppliersById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersQ.data ?? []) m.set(s.id, s.name);
    return m;
  }, [suppliersQ.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bestellung", "wines"] });
    qc.invalidateQueries({ queryKey: ["bestellung", "articles"] });
  };

  const buildPayload = (d: WineDraft, existingLocationIds?: string[]) => {
    const cents = parseEuroToCents(d.priceEuro);
    if (cents == null) throw new Error("Preis ungültig.");
    if (!d.supplierId) throw new Error("Lieferant wählen.");
    if (!d.name.trim()) throw new Error("Name fehlt.");
    const locIds =
      existingLocationIds && existingLocationIds.length > 0 ? existingLocationIds : allLocationIds;
    if (locIds.length === 0) throw new Error("Keine Standorte verfügbar.");
    return {
      supplierId: d.supplierId,
      name: d.name,
      sku: "",
      description: d.description,
      category: "Wein",
      unit: d.unit || "Fl",
      priceCents: cents,
      packagingUnit: null,
      imageUrl: d.imageUrl,
      sortOrder: 0,
      grapeVariety: d.grapeVariety,
      originCountry: d.originCountry,
      foodPairings: d.foodPairings,
      specialAttributes: d.specialAttributes.length > 0 ? d.specialAttributes : null,
      locationIds: locIds,
    };
  };

  const createMut = useMutation({
    mutationFn: (d: WineDraft) => callCreate({ data: buildPayload(d) }),
    onSuccess: () => {
      setCreateOpen(false);
      setMsg(null);
      refresh();
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; draft: WineDraft }) =>
      callUpdate({
        data: {
          ...buildPayload(
            input.draft,
            (winesQ.data ?? []).find((w) => w.id === input.id)?.locationIds ?? [],
          ),
          articleId: input.id,
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      setMsg(null);
      refresh();
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      callToggle({ data: { articleId: input.id, isActive: input.isActive } }),
    onSuccess: refresh,
    onError: (e) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const filtered = useMemo(() => {
    const list = winesQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => {
      return (
        w.name.toLowerCase().includes(q) ||
        (w.grape_variety ?? "").toLowerCase().includes(q) ||
        (w.origin_country ?? "").toLowerCase().includes(q)
      );
    });
  }, [winesQ.data, search]);

  const startBatch = async () => {
    const wines = winesQ.data ?? [];
    if (wines.length === 0) return;
    cancelRef.current = false;
    setBatchRunning(true);
    setBatchStatus("running");
    setBatchApplyMsg(null);
    setBatchResults(new Map());
    setBatchProgress({ done: 0, total: wines.length, current: wines[0]?.name ?? "" });
    let aborted = false;
    let hardFail: string | null = null;
    let autoApplied = 0;
    let autoFailed = 0;
    for (let i = 0; i < wines.length; i++) {
      if (cancelRef.current) {
        aborted = true;
        break;
      }
      const w = wines[i];
      setBatchProgress({ done: i, total: wines.length, current: w.name });
      try {
        const item = await callBatchResearch({ data: { articleId: w.id } });
        const selected = defaultSelection(item);
        setBatchResults((prev) => {
          const next = new Map(prev);
          next.set(item.articleId, { item, selected });
          return next;
        });
        // Sofort übernehmen: alle vorschlagbaren Felder (nicht leer, nicht identisch),
        // damit Frank am Ende nur noch das Ergebnis sieht.
        const s = item.suggestion;
        const applySelected: Record<BatchField, boolean> = s
          ? {
              grapeVariety:
                !!s.grapeVariety.trim() && !sameStr(w.grape_variety ?? "", s.grapeVariety),
              originCountry:
                !!s.originCountry.trim() && !sameStr(w.origin_country ?? "", s.originCountry),
              foodPairings:
                !!s.foodPairings.trim() && !sameStr(w.food_pairings ?? "", s.foodPairings),
              description: !!s.description.trim() && !sameStr(w.description ?? "", s.description),
              specialAttributes:
                s.specialAttributes.length > 0 &&
                !sameAttrs(
                  Array.isArray(w.special_attributes) ? (w.special_attributes as string[]) : [],
                  s.specialAttributes,
                ),
            }
          : {
              grapeVariety: false,
              originCountry: false,
              foodPairings: false,
              description: false,
              specialAttributes: false,
            };
        if (s && BATCH_FIELDS.some((f) => applySelected[f])) {
          try {
            await callUpdate({
              data: {
                articleId: w.id,
                supplierId: w.supplier_id,
                name: w.name,
                sku: w.sku ?? "",
                description: applySelected.description ? s.description : (w.description ?? ""),
                category: "Wein",
                unit: w.unit ?? "Fl",
                priceCents: w.price_cents,
                packagingUnit: w.packaging_unit ?? null,
                imageUrl: w.image_url ?? "",
                sortOrder: w.sort_order ?? 0,
                grapeVariety: applySelected.grapeVariety ? s.grapeVariety : (w.grape_variety ?? ""),
                originCountry: applySelected.originCountry
                  ? s.originCountry
                  : (w.origin_country ?? ""),
                foodPairings: applySelected.foodPairings ? s.foodPairings : (w.food_pairings ?? ""),
                specialAttributes: applySelected.specialAttributes
                  ? s.specialAttributes.length > 0
                    ? s.specialAttributes
                    : null
                  : Array.isArray(w.special_attributes) && w.special_attributes.length > 0
                    ? (w.special_attributes as string[])
                    : null,
                locationIds: (w.locationIds ?? []).length > 0 ? w.locationIds : allLocationIds,
              },
            });
            autoApplied++;
            // Selektion nach Übernahme abhaken, damit UI Klarheit hat.
            setBatchResults((prev) => {
              const next = new Map(prev);
              const cur = next.get(item.articleId);
              if (cur) {
                next.set(item.articleId, {
                  ...cur,
                  selected: {
                    grapeVariety: false,
                    originCountry: false,
                    foodPairings: false,
                    description: false,
                    specialAttributes: false,
                  },
                });
              }
              return next;
            });
          } catch {
            autoFailed++;
          }
        }
      } catch (e) {
        // Auth/Owner-Fehler: schleife nicht weiterlaufen lassen.
        hardFail = e instanceof Error ? e.message : "Recherche abgebrochen.";
        setBatchApplyMsg(hardFail);
        break;
      }
      // sanftes Ratelimit
      await new Promise((r) => setTimeout(r, 1000));
    }
    setBatchProgress((p) => (p ? { ...p, done: p.total, current: "" } : null));
    setBatchRunning(false);
    setBatchStatus(hardFail ? "failed" : aborted ? "cancelled" : "done");
    if (!hardFail && (autoApplied > 0 || autoFailed > 0)) {
      setBatchApplyMsg(
        `Automatisch übernommen: ${autoApplied}${autoFailed > 0 ? `, ${autoFailed} fehlgeschlagen` : ""}.`,
      );
      refresh();
    }
  };

  const applyBatch = async () => {
    setBatchApplying(true);
    setBatchApplyMsg(null);
    const entries = Array.from(batchResults.values());
    const winesById = new Map((winesQ.data ?? []).map((w) => [w.id, w] as const));
    let updated = 0;
    let failed = 0;
    for (const entry of entries) {
      const s = entry.item.suggestion;
      if (!s) continue;
      const w = winesById.get(entry.item.articleId);
      if (!w) continue;
      const anySelected = BATCH_FIELDS.some((f) => entry.selected[f]);
      if (!anySelected) continue;
      try {
        await callUpdate({
          data: {
            articleId: w.id,
            supplierId: w.supplier_id,
            name: w.name,
            sku: w.sku ?? "",
            description: entry.selected.description ? s.description : (w.description ?? ""),
            category: "Wein",
            unit: w.unit ?? "Fl",
            priceCents: w.price_cents,
            packagingUnit: w.packaging_unit ?? null,
            imageUrl: w.image_url ?? "",
            sortOrder: w.sort_order ?? 0,
            grapeVariety: entry.selected.grapeVariety ? s.grapeVariety : (w.grape_variety ?? ""),
            originCountry: entry.selected.originCountry
              ? s.originCountry
              : (w.origin_country ?? ""),
            foodPairings: entry.selected.foodPairings ? s.foodPairings : (w.food_pairings ?? ""),
            specialAttributes: entry.selected.specialAttributes
              ? s.specialAttributes.length > 0
                ? s.specialAttributes
                : null
              : Array.isArray(w.special_attributes) && w.special_attributes.length > 0
                ? w.special_attributes
                : null,
            locationIds: (w.locationIds ?? []).length > 0 ? w.locationIds : allLocationIds,
          },
        });
        updated++;
      } catch {
        failed++;
      }
    }
    setBatchApplying(false);
    setBatchApplyMsg(
      `Übernahme fertig: ${updated} aktualisiert${failed > 0 ? `, ${failed} fehlgeschlagen` : ""}.`,
    );
    refresh();
  };

  const toggleBatchField = (articleId: string, field: BatchField) => {
    setBatchResults((prev) => {
      const next = new Map(prev);
      const entry = next.get(articleId);
      if (!entry) return prev;
      next.set(articleId, {
        ...entry,
        selected: { ...entry.selected, [field]: !entry.selected[field] },
      });
      return next;
    });
  };

  const totalWines = (winesQ.data ?? []).length;
  const batchEntries = Array.from(batchResults.values());
  const selectedCount = batchEntries.reduce(
    (n, e) => n + (BATCH_FIELDS.some((f) => e.selected[f]) ? 1 : 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[200px] text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">
            Suche (Name, Rebsorte, Herkunft)
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Inaktive
        </label>
        <button
          onClick={() => {
            setCreateOpen((v) => !v);
            setMsg(null);
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {createOpen ? "Abbrechen" : "Neuer Wein"}
        </button>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={() => setBatchOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            KI-Recherche für alle Weine
            <BatchStatusBadge status={batchStatus} />
          </span>
          <span className="text-xs text-muted-foreground">{batchOpen ? "▲" : "▼"}</span>
        </button>
        {batchOpen && (
          <div className="space-y-3 border-t border-border p-4">
            <p className="text-xs text-muted-foreground">
              Läuft nacheinander alle Weine durch (~1 s Pause pro Aufruf). Vorschläge werden nicht
              automatisch gespeichert — Felder mit Konflikt sind standardmäßig nicht angehakt.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startBatch}
                disabled={batchRunning || totalWines === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                🔎 Alle Weine recherchieren ({totalWines})
              </button>
              {batchRunning && (
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Abbrechen
                </button>
              )}
            </div>
            {batchProgress && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {batchProgress.done} / {batchProgress.total}
                    {batchProgress.current ? ` — aktuell: ${batchProgress.current}` : ""}
                  </span>
                  <span>
                    {batchProgress.total > 0
                      ? Math.round((batchProgress.done / batchProgress.total) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      batchStatus === "failed"
                        ? "h-full bg-destructive transition-[width] duration-300"
                        : batchStatus === "cancelled"
                          ? "h-full bg-muted-foreground/60 transition-[width] duration-300"
                          : "h-full bg-primary transition-[width] duration-300"
                    }
                    style={{
                      width:
                        batchProgress.total > 0
                          ? `${Math.min(100, Math.round((batchProgress.done / batchProgress.total) * 100))}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            )}
            {batchApplyMsg && <p className="text-xs text-muted-foreground">{batchApplyMsg}</p>}
            {batchEntries.length > 0 && (
              <div className="space-y-3">
                {batchEntries.map((entry) => (
                  <BatchEntryCard
                    key={entry.item.articleId}
                    entry={entry}
                    onToggle={(f) => toggleBatchField(entry.item.articleId, f)}
                  />
                ))}
                <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    {selectedCount} von {batchEntries.length} Weinen mit Auswahl
                  </span>
                  <button
                    type="button"
                    onClick={applyBatch}
                    disabled={batchApplying || selectedCount === 0}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {batchApplying ? "Übernehme …" : "Alle ausgewählten Vorschläge übernehmen"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {createOpen && (
        <WineForm
          initial={emptyDraft()}
          suppliers={suppliersQ.data ?? []}
          submitLabel="Anlegen"
          submitting={createMut.isPending}
          onSubmit={(d) => createMut.mutate(d)}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {winesQ.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
      {filtered.length === 0 && !winesQ.isLoading && (
        <p className="text-sm text-muted-foreground">
          Noch keine Weine angelegt. Erstelle einen Wein mit Kategorie „Wein".
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((w) => (
          <div key={w.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground">{w.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {suppliersById.get(w.supplier_id) ?? "—"}
                </p>
              </div>
              <div className="text-right font-mono text-sm">{fmtEuro(w.price_cents)}</div>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {w.grape_variety && <Row label="Rebsorte" value={w.grape_variety} />}
              {w.origin_country && <Row label="Herkunft" value={w.origin_country} />}
              {w.food_pairings && <Row label="Passt zu" value={w.food_pairings} />}
            </dl>
            {Array.isArray(w.special_attributes) && w.special_attributes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {w.special_attributes.map((a) => (
                  <span key={a} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {a}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={() => toggleMut.mutate({ id: w.id, isActive: !w.is_active })}
                className={
                  w.is_active
                    ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {w.is_active ? "aktiv" : "inaktiv"}
              </button>
              <button
                onClick={() => setEditingId(editingId === w.id ? null : w.id)}
                className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                {editingId === w.id ? "Schließen" : "Bearbeiten"}
              </button>
            </div>
            {editingId === w.id && (
              <div className="mt-3">
                <WineForm
                  initial={{
                    supplierId: w.supplier_id,
                    name: w.name,
                    priceEuro: (w.price_cents / 100).toFixed(2).replace(".", ","),
                    unit: w.unit ?? "Fl",
                    description: w.description ?? "",
                    grapeVariety: w.grape_variety ?? "",
                    originCountry: w.origin_country ?? "",
                    foodPairings: w.food_pairings ?? "",
                    specialAttributes: Array.isArray(w.special_attributes)
                      ? w.special_attributes
                      : [],
                    imageUrl: w.image_url ?? "",
                  }}
                  suppliers={suppliersQ.data ?? []}
                  submitLabel="Speichern"
                  submitting={updateMut.isPending}
                  onSubmit={(d) => updateMut.mutate({ id: w.id, draft: d })}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function WineForm(props: {
  initial: WineDraft;
  suppliers: Array<{ id: string; name: string }>;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (d: WineDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<WineDraft>(props.initial);
  const set = <K extends keyof WineDraft>(k: K, v: WineDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const [researching, setResearching] = useState(false);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);
  const callResearch = useServerFn(researchWine);

  const runResearch = async () => {
    if (!d.name.trim() || d.name.trim().length < 2) {
      setResearchMsg("Bitte zuerst den Weinnamen eintragen.");
      return;
    }
    setResearching(true);
    setResearchMsg(null);
    try {
      const hintsParts = [d.originCountry, d.grapeVariety].filter((s) => s.trim());
      const result = await callResearch({
        data: { name: d.name.trim(), hints: hintsParts.join(" ") },
      });
      setD((p) => ({
        ...p,
        grapeVariety: p.grapeVariety.trim() || result.grapeVariety,
        originCountry: p.originCountry.trim() || result.originCountry,
        foodPairings: p.foodPairings.trim() || result.foodPairings,
        description: p.description.trim() || result.description,
        specialAttributes:
          p.specialAttributes.length > 0 ? p.specialAttributes : result.specialAttributes,
      }));
      const filled = [
        result.grapeVariety && "Rebsorte",
        result.originCountry && "Herkunft",
        result.foodPairings && "Speisenempfehlungen",
        result.description && "Beschreibung",
        result.specialAttributes.length > 0 && "Merkmale",
      ].filter(Boolean);
      setResearchMsg(
        filled.length > 0
          ? `Vorschlag übernommen (${filled.join(", ")}). Bitte prüfen — Quellen: ${result.sources.length}`
          : "KI konnte nichts belegen. Bitte manuell ergänzen.",
      );
    } catch (e) {
      setResearchMsg(e instanceof Error ? e.message : "Recherche fehlgeschlagen.");
    } finally {
      setResearching(false);
    }
  };

  const toggleAttr = (attr: string) => {
    setD((p) => ({
      ...p,
      specialAttributes: p.specialAttributes.includes(attr)
        ? p.specialAttributes.filter((x) => x !== attr)
        : [...p.specialAttributes, attr],
    }));
  };

  return (
    <form
      className="space-y-3 rounded-md border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(d);
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Lieferant *">
          <select
            required
            value={d.supplierId}
            onChange={(e) => set("supplierId", e.target.value)}
            className={selectCls}
          >
            <option value="">— wählen —</option>
            {props.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name *">
          <input
            required
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Preis (€) *">
          <input
            required
            inputMode="decimal"
            placeholder="z. B. 14,90"
            value={d.priceEuro}
            onChange={(e) => set("priceEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Einheit">
          <input
            value={d.unit}
            onChange={(e) => set("unit", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-md border border-dashed border-border p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
          Wein-Details
        </legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Leere Felder per KI-Recherche vorschlagen (füllt nur Leeres, überschreibt nichts).
          </p>
          <button
            type="button"
            onClick={runResearch}
            disabled={researching}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
          >
            {researching ? "Recherchiert …" : "🔎 KI-Recherche"}
          </button>
        </div>
        {researchMsg && <p className="text-xs text-muted-foreground">{researchMsg}</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Rebsorte">
            <input
              value={d.grapeVariety}
              onChange={(e) => set("grapeVariety", e.target.value)}
              placeholder="z. B. Riesling"
              className={inputCls}
            />
          </Field>
          <Field label="Herkunftsland">
            <input
              value={d.originCountry}
              onChange={(e) => set("originCountry", e.target.value)}
              placeholder="z. B. Deutschland"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Speisenempfehlungen">
          <textarea
            rows={2}
            value={d.foodPairings}
            onChange={(e) => set("foodPairings", e.target.value)}
            placeholder="z. B. Fisch, Geflügel, Käse"
            className={inputCls}
          />
        </Field>
        <div>
          <span className="block text-xs uppercase tracking-wide text-muted-foreground">
            Besondere Merkmale
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {SPECIAL_ATTRS.map((a) => {
              const active = d.specialAttributes.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAttr(a)}
                  className={
                    active
                      ? "rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                      : "rounded-full border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
                  }
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <Field label="Beschreibung">
        <textarea
          rows={2}
          value={d.description}
          onChange={(e) => set("description", e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={props.submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {props.submitting ? "…" : props.submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="block uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const selectCls = inputCls;

function BatchStatusBadge(props: { status: "idle" | "running" | "cancelled" | "done" | "failed" }) {
  const map: Record<typeof props.status, { label: string; cls: string; dot?: boolean }> = {
    idle: { label: "Bereit", cls: "bg-muted text-muted-foreground" },
    running: {
      label: "Läuft",
      cls: "bg-primary/15 text-primary",
      dot: true,
    },
    done: {
      label: "Abgeschlossen",
      cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    },
    cancelled: { label: "Abgebrochen", cls: "bg-muted text-muted-foreground" },
    failed: { label: "Fehlgeschlagen", cls: "bg-destructive/15 text-destructive" },
  };
  const { label, cls, dot } = map[props.status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}

function BatchEntryCard(props: {
  entry: { item: WineResearchBatchItem; selected: Record<BatchField, boolean> };
  onToggle: (field: BatchField) => void;
}) {
  const { item, selected } = props.entry;
  const s = item.suggestion;
  const c = item.current;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{item.name}</h4>
        {item.error && <span className="text-xs text-destructive">{item.error}</span>}
      </div>
      {s && (
        <div className="mt-2 space-y-1.5 text-xs">
          {BATCH_FIELDS.map((f) => {
            const cur =
              f === "specialAttributes" ? c.specialAttributes.join(", ") : (c[f] as string);
            const sug =
              f === "specialAttributes" ? s.specialAttributes.join(", ") : (s[f] as string);
            if (!sug.trim() && !cur.trim()) return null;
            const identical = sug.trim() !== "" && sameStr(cur, sug);
            return (
              <label key={f} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={selected[f]}
                  onChange={() => props.onToggle(f)}
                  disabled={!sug.trim() || identical}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-muted-foreground">{FIELD_LABEL[f]}</div>
                  <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                    <div className="rounded bg-muted/40 px-2 py-1">
                      <span className="text-[10px] uppercase text-muted-foreground">Aktuell</span>
                      <div className="text-foreground">{cur || "—"}</div>
                    </div>
                    <div
                      className={
                        identical
                          ? "rounded bg-muted/40 px-2 py-1"
                          : "rounded bg-primary/10 px-2 py-1"
                      }
                    >
                      <span className="text-[10px] uppercase text-muted-foreground">Vorschlag</span>
                      <div className="text-foreground">{sug || "—"}</div>
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
          {s.sources.length > 0 && (
            <div className="pt-1 text-[10px] text-muted-foreground">
              Quellen:{" "}
              {s.sources.map((u, i) => (
                <span key={u}>
                  {i > 0 && ", "}
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-foreground"
                  >
                    [{i + 1}]
                  </a>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
