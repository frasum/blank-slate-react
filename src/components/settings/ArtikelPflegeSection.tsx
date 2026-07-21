// AP1-A — Artikel-Massenpflege (read-only + geprüft-Häkchen).
// Runde A liefert die Übersicht nach Lieferant × Kategorie mit dem Häkchen
// „geprüft" pro Zeile, damit Frank sich über mehrere Sessions an die ~1335
// Artikel arbeiten kann. Runde B setzt später Inline-Editoren in die Zellen.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listArticles, setArticleReviewed } from "@/lib/bestellung/articles.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  groupArticlesBySupplier,
  type ArtikelPflegeArticle,
} from "@/lib/bestellung/artikel-pflege";
import { fmtCents } from "@/lib/format";
import { cn } from "@/lib/utils";

// AP1-A — Query-Key wird EINMAL an einer Stelle festgelegt und für
// Snapshot-Lesen, optimistischen Patch und Invalidate identisch verwendet.
// Bewusst NICHT an den Key aus bestellung.lieferanten.tsx gekoppelt.
const ARTIKEL_KEY = ["settings", "artikel-pflege", "articles", { includeInactive: true }] as const;

type Article = Awaited<ReturnType<typeof listArticles>>[number];

function shortLocationLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 6) return trimmed;
  return trimmed.slice(0, 4) + "…";
}

export function ArtikelPflegeSection() {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);

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

  const groups = useMemo(() => {
    const articles = (articlesQ.data ?? []) as ArtikelPflegeArticle[] as Article[];
    const suppliers = (suppliersQ.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_active: s.is_active,
    }));
    return groupArticlesBySupplier<Article>(articles, suppliers, { showInactive });
  }, [articlesQ.data, suppliersQ.data, showInactive]);

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
                <span className="font-medium">{g.supplierName}</span>
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
                            <td className="px-2 py-1 font-medium text-foreground">{a.name}</td>
                            <td className="px-2 py-1">{a.category ?? "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {fmtCents(a.price_cents)} €
                            </td>
                            <td className="px-2 py-1">{a.order_unit}</td>
                            <td className="px-2 py-1">{a.inventory_unit}</td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {a.order_to_inventory_factor}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {a.min_order_quantity}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">{a.quantity_step}</td>
                            <td className="px-2 py-1">
                              {a.allow_decimal_order_quantity ? "✓" : "–"}
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex flex-wrap gap-1">
                                {a.locationIds.length === 0 ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  a.locationIds.map((id) => (
                                    <span
                                      key={id}
                                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                      {locationLabels.get(id) ?? id.slice(0, 4)}
                                    </span>
                                  ))
                                )}
                              </div>
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
    </section>
  );
}
