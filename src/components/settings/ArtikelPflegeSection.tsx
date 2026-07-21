// AP1-A/B — Artikel-Massenpflege.
// Runde A: Grid + geprüft-Häkchen (unverändert).
// Runde B: Zellen inline-editierbar (Kategorie, Preis, Einheiten, Faktor,
// Min/Schritt, Dezimal-Toggle, Standort-Chips) über bestehendes
// `updateArticle` / `setArticleLocations`. Voll-Objekt-Write via
// `rowToArticleInput`, damit unerwähnte Felder unberührt bleiben.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import {
  listArticles,
  setArticleReviewed,
  setArticleLocations,
  updateArticle,
} from "@/lib/bestellung/articles.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { listTaxonomy } from "@/lib/bestellung/taxonomy.functions";
import {
  groupArticlesBySupplier,
  rowToArticleInput,
  type ArtikelPflegeRow,
} from "@/lib/bestellung/artikel-pflege";
import { parseNumberDe } from "@/lib/bestellung/parse-de";
import { fmtCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArticleForm } from "@/components/bestellung/ArticleForm";
import { articleRowToDraft, draftToArticleUpdateInput } from "@/lib/bestellung/article-draft";

// AP1-A — Query-Key wird EINMAL an einer Stelle festgelegt und für
// Snapshot-Lesen, optimistischen Patch und Invalidate identisch verwendet.
// Bewusst NICHT an den Key aus bestellung.lieferanten.tsx gekoppelt.
const ARTIKEL_KEY = ["settings", "artikel-pflege", "articles", { includeInactive: true }] as const;

type Article = Awaited<ReturnType<typeof listArticles>>[number];

// Felder, die inline editierbar sind. Namen entsprechen den Spalten in DB
// bzw. dem `Article`-Row-Type.
type EditableField =
  | "category"
  | "price_cents"
  | "order_unit"
  | "inventory_unit"
  | "order_to_inventory_factor"
  | "min_order_quantity"
  | "quantity_step"
  | "allow_decimal_order_quantity";

type FieldPatch = Partial<Pick<Article, EditableField>>;

function shortLocationLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 6) return trimmed;
  return trimmed.slice(0, 4) + "…";
}

export function ArtikelPflegeSection() {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);
  const [editArticleId, setEditArticleId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const articlesQ = useQuery({
    queryKey: ARTIKEL_KEY,
    queryFn: () => listArticles({ data: { includeInactive: true } }),
  });
  const suppliersQ = useQuery({
    queryKey: ["settings", "artikel-pflege", "suppliers"],
    queryFn: () => listSuppliers({ data: { includeInactive: false } }),
  });
  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
  });
  // ST1-B — Kategorien & Einheiten aus der kuratierten Taxonomie.
  const taxonomyQ = useQuery({
    queryKey: ["settings", "taxonomy"],
    queryFn: () => listTaxonomy(),
  });

  const callSetReviewed = useServerFn(setArticleReviewed);
  const reviewMutation = useMutation({
    mutationFn: (vars: { articleId: string; reviewed: boolean }) => callSetReviewed({ data: vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ARTIKEL_KEY });
      const previous = queryClient.getQueryData<Article[]>(ARTIKEL_KEY);
      if (previous) {
        const nextStamp = vars.reviewed ? new Date().toISOString() : null;
        queryClient.setQueryData<Article[]>(
          ARTIKEL_KEY,
          previous.map((a) => (a.id === vars.articleId ? { ...a, reviewed_at: nextStamp } : a)),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ARTIKEL_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY });
    },
  });

  // AP1-B — einheitliche Feld-Mutation über updateArticle (Voll-Objekt-Write).
  const callUpdateArticle = useServerFn(updateArticle);
  const fieldMutation = useMutation({
    mutationFn: async (vars: { articleId: string; patch: FieldPatch }) => {
      const current = queryClient.getQueryData<Article[]>(ARTIKEL_KEY);
      const row = current?.find((a) => a.id === vars.articleId);
      if (!row) throw new Error("Artikel nicht gefunden.");
      const merged = { ...row, ...vars.patch } as ArtikelPflegeRow;
      const input = rowToArticleInput(merged);
      return callUpdateArticle({ data: { articleId: vars.articleId, ...input } });
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ARTIKEL_KEY });
      const previous = queryClient.getQueryData<Article[]>(ARTIKEL_KEY);
      if (previous) {
        queryClient.setQueryData<Article[]>(
          ARTIKEL_KEY,
          previous.map((a) => (a.id === vars.articleId ? { ...a, ...vars.patch } : a)),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ARTIKEL_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY });
    },
  });

  // AP1-B — Standorte via setArticleLocations (BL1-Muster).
  const callSetLocations = useServerFn(setArticleLocations);
  const locationsMutation = useMutation({
    mutationFn: (vars: { articleId: string; locationIds: string[] }) =>
      callSetLocations({ data: vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ARTIKEL_KEY });
      const previous = queryClient.getQueryData<Article[]>(ARTIKEL_KEY);
      if (previous) {
        queryClient.setQueryData<Article[]>(
          ARTIKEL_KEY,
          previous.map((a) =>
            a.id === vars.articleId ? { ...a, locationIds: vars.locationIds } : a,
          ),
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ARTIKEL_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY });
    },
  });

  const groups = useMemo(() => {
    const articles = (articlesQ.data ?? []) as Article[];
    const suppliers = (suppliersQ.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_active: s.is_active,
    }));
    return groupArticlesBySupplier<Article>(articles, suppliers, { showInactive });
  }, [articlesQ.data, suppliersQ.data, showInactive]);

  const allArticles = useMemo(() => articlesQ.data ?? [], [articlesQ.data]);
  // ST1-B — Options-Quellen aus der Taxonomie (nicht mehr aus Artikel-Werten).
  const categoryOptions = useMemo(
    () => (taxonomyQ.data?.categories ?? []).map((c) => c.name),
    [taxonomyQ.data],
  );
  const unitOptions = useMemo(
    () => (taxonomyQ.data?.units ?? []).map((u) => u.name),
    [taxonomyQ.data],
  );

  const locationLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of locationsQ.data ?? []) map.set(l.id, shortLocationLabel(l.name));
    return map;
  }, [locationsQ.data]);

  if (articlesQ.isLoading || suppliersQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Lade…</p>;
  }
  if (articlesQ.error || suppliersQ.error) {
    return <p className="text-sm text-destructive">Artikel konnten nicht geladen werden.</p>;
  }

  const editRow = editArticleId ? (allArticles.find((a) => a.id === editArticleId) ?? null) : null;
  const allLocationIds = (locationsQ.data ?? []).map((l) => l.id);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Artikel-Massenpflege</h2>
          <p className="text-sm text-muted-foreground">
            Alle Bestellartikel nach Lieferant. Häkchen setzen, um den Pflege-Durchgang zu
            markieren.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Inaktive Artikel anzeigen
        </label>
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const isOpen = openSupplierId === g.supplierId;
          return (
            <div key={g.supplierId} className="overflow-hidden rounded-md border border-border/60">
              <button
                type="button"
                onClick={() => setOpenSupplierId(isOpen ? null : g.supplierId)}
                className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2 font-medium">
                  <ChevronRight
                    className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")}
                  />
                  {g.supplierName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.articles.length} Artikel · {g.reviewedCount} geprüft
                </span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-xs">
                    <thead className="bg-muted/20 text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1">✓</th>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Kategorie</th>
                        <th className="px-2 py-1 text-right">€ pro BE</th>
                        <th className="px-2 py-1">BE</th>
                        <th className="px-2 py-1">IE</th>
                        <th className="px-2 py-1 text-right">1 BE = X IE</th>
                        <th className="px-2 py-1 text-right">Min</th>
                        <th className="px-2 py-1 text-right">Schritt</th>
                        <th className="px-2 py-1">Dez.</th>
                        <th className="px-2 py-1">Standorte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.articles.map((a) => {
                        const reviewed = a.reviewed_at != null;
                        const rowDim = !a.is_active ? "opacity-50" : "";
                        return (
                          <tr key={a.id} className={cn("border-t border-border/40", rowDim)}>
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={reviewed}
                                disabled={reviewMutation.isPending}
                                onChange={(e) =>
                                  reviewMutation.mutate({
                                    articleId: a.id,
                                    reviewed: e.target.checked,
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 font-medium text-foreground">
                              <button
                                type="button"
                                onClick={() => setEditArticleId(a.id)}
                                className="text-left hover:underline"
                                title="Artikel bearbeiten"
                              >
                                {a.name}
                              </button>
                            </td>
                            <td className="px-2 py-1">
                              <SelectCell
                                value={a.category ?? ""}
                                options={categoryOptions}
                                allowEmpty
                                onCommit={(next) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { category: next === "" ? null : next },
                                  })
                                }
                              />
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                              <PriceCell
                                cents={a.price_cents}
                                onCommit={(cents) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { price_cents: cents },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <SelectCell
                                value={a.order_unit}
                                options={unitOptions}
                                onCommit={(next) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { order_unit: next },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <SelectCell
                                value={a.inventory_unit}
                                options={unitOptions}
                                onCommit={(next) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { inventory_unit: next },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              <NumberCell
                                value={a.order_to_inventory_factor}
                                onCommit={(next) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { order_to_inventory_factor: next },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              <NumberCell
                                value={a.min_order_quantity}
                                onCommit={(next) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { min_order_quantity: next },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              <NumberCell
                                value={a.quantity_step}
                                onCommit={(next) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { quantity_step: next },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={a.allow_decimal_order_quantity}
                                disabled={fieldMutation.isPending}
                                onChange={(e) =>
                                  fieldMutation.mutate({
                                    articleId: a.id,
                                    patch: { allow_decimal_order_quantity: e.target.checked },
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <LocationChips
                                selected={a.locationIds}
                                all={locationsQ.data ?? []}
                                labels={locationLabels}
                                disabled={locationsMutation.isPending}
                                onToggle={(locId) => {
                                  const has = a.locationIds.includes(locId);
                                  if (has && a.locationIds.length <= 1) {
                                    toast.error("Mindestens ein Standort erforderlich.");
                                    return;
                                  }
                                  const next = has
                                    ? a.locationIds.filter((x) => x !== locId)
                                    : [...a.locationIds, locId];
                                  locationsMutation.mutate({
                                    articleId: a.id,
                                    locationIds: next,
                                  });
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {g.articles.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-2 py-3 text-center text-muted-foreground">
                            Keine Artikel.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!editRow}
        onOpenChange={(open) => {
          if (!open) setEditArticleId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Artikel bearbeiten</DialogTitle>
          </DialogHeader>
          {editRow &&
            (() => {
              const { draft, locationIds } = articleRowToDraft(editRow, allLocationIds);
              return (
                <ArticleForm
                  initial={draft}
                  suppliers={(suppliersQ.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
                  initialSupplierId={editRow.supplier_id}
                  locations={(locationsQ.data ?? []).map((l) => ({ id: l.id, name: l.name }))}
                  initialLocationIds={locationIds}
                  categories={categoryOptions}
                  units={unitOptions}
                  submitLabel="Speichern"
                  submitting={editSubmitting}
                  onCancel={() => setEditArticleId(null)}
                  onSubmit={async (d, supplierId, locIds) => {
                    setEditSubmitting(true);
                    try {
                      await callUpdateArticle({
                        data: {
                          articleId: editRow.id,
                          supplierId,
                          ...draftToArticleUpdateInput(d),
                          locationIds: locIds,
                        },
                      });
                      toast.success("Artikel gespeichert.");
                      setEditArticleId(null);
                      await queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
                    } finally {
                      setEditSubmitting(false);
                    }
                  }}
                />
              );
            })()}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ————— Inline-Editor-Zellen —————

// ST1-B — Inline-Select für kuratierte Listen. Fremdwerte bleiben als
// „(nicht in Liste)"-Option erhalten; ein bloßes Öffnen ändert nichts.
function SelectCell({
  value,
  options,
  onCommit,
  allowEmpty = false,
}: {
  value: string;
  options: string[];
  onCommit: (next: string) => void;
  allowEmpty?: boolean;
}) {
  const trimmed = value.trim();
  const inList = trimmed === "" || options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  return (
    <select
      value={trimmed}
      onChange={(e) => {
        const next = e.target.value;
        if (next === trimmed) return;
        if (!allowEmpty && next === "") {
          toast.error("Pflichtfeld darf nicht leer sein.");
          return;
        }
        onCommit(next);
      }}
      className="w-full min-w-[4rem] rounded border border-border/60 bg-background px-1 py-0.5"
    >
      {allowEmpty && <option value="">—</option>}
      {!inList && trimmed !== "" && <option value={trimmed}>{trimmed} (nicht in Liste)</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function NumberCell({
  value,
  onCommit,
  allowZero = false,
}: {
  value: number;
  onCommit: (next: number) => void;
  allowZero?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="w-full cursor-text rounded px-1 py-0.5 text-right tabular-nums hover:bg-muted/60"
      >
        {value}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    const n = parseNumberDe(draft);
    if (n === null || (!allowZero && n <= 0)) {
      toast.error("Ungültige Zahl.");
      return;
    }
    if (n === value) return;
    onCommit(n);
  };
  return (
    <input
      ref={inputRef}
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
        }
      }}
      className="w-16 rounded border border-border/60 bg-background px-1 py-0.5 text-right tabular-nums"
    />
  );
}

function PriceCell({ cents, onCommit }: { cents: number; onCommit: (cents: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fmtCents(cents));
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(fmtCents(cents));
          setEditing(true);
        }}
        className="w-full cursor-text rounded px-1 py-0.5 text-right tabular-nums hover:bg-muted/60"
      >
        {fmtCents(cents)} €
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    const n = parseNumberDe(draft);
    if (n === null || n <= 0) {
      toast.error("Ungültiger Preis.");
      return;
    }
    const nextCents = Math.round(n * 100);
    if (nextCents === cents) return;
    onCommit(nextCents);
  };
  return (
    <input
      ref={inputRef}
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
        }
      }}
      className="w-20 rounded border border-border/60 bg-background px-1 py-0.5 text-right tabular-nums"
    />
  );
}

function LocationChips({
  selected,
  all,
  labels,
  disabled,
  onToggle,
}: {
  selected: string[];
  all: { id: string; name: string }[];
  labels: Map<string, string>;
  disabled: boolean;
  onToggle: (locId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {all.map((l) => {
        const active = selected.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(l.id)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            title={l.name}
          >
            {labels.get(l.id) ?? l.name.slice(0, 4)}
          </button>
        );
      })}
    </div>
  );
}
