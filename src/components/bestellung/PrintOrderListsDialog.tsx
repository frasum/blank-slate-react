// DL1 — Auswahl-Dialog für druckbare Bestelllisten (Keller-Laufzettel).
//
// Reine Lese-/Druck-UI: nutzt die vom Aufrufer übergebenen (bereits geladenen)
// Daten und ruft printOrderLists() auf. Kein Server-Schreibpfad.

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  printOrderLists,
  type PrintArticle,
  type PrintSection,
} from "@/lib/bestellung/print-order-lists";

const WINE_CATEGORY = "Wein";
const WINE_KEY = "__wine__";

export type PrintDialogSupplier = { id: string; name: string; is_active: boolean };

export type PrintDialogArticle = {
  id: string;
  supplier_id: string;
  name: string;
  category: string | null;
  order_unit: string;
  unit: string;
  is_active: boolean;
  locationIds?: string[];
};

export function PrintOrderListsDialog(props: {
  open: boolean;
  onClose: () => void;
  suppliers: PrintDialogSupplier[];
  articles: PrintDialogArticle[];
  lastOrderByArticle: Record<string, { date: string } | undefined>;
  locationId: string | null;
  locationName: string;
}) {
  // Nur aktive Lieferanten + aktive, für den Standort freigegebene Artikel.
  const activeArticlesByLoc = useMemo(() => {
    return props.articles.filter(
      (a) => a.is_active && (!props.locationId || (a.locationIds ?? []).includes(props.locationId)),
    );
  }, [props.articles, props.locationId]);

  const countBySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activeArticlesByLoc) m.set(a.supplier_id, (m.get(a.supplier_id) ?? 0) + 1);
    return m;
  }, [activeArticlesByLoc]);

  const activeSuppliers = useMemo(() => {
    return props.suppliers
      .filter((s) => s.is_active && (countBySupplier.get(s.id) ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [props.suppliers, countBySupplier]);

  const wineCount = useMemo(
    () => activeArticlesByLoc.filter((a) => (a.category ?? "").trim() === WINE_CATEGORY).length,
    [activeArticlesByLoc],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearAll = () => setSelected(new Set());

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of props.suppliers) m.set(s.id, s.name);
    return m;
  }, [props.suppliers]);

  function toPrintArticle(a: PrintDialogArticle): PrintArticle {
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      orderUnit: a.order_unit || a.unit || "",
      lastOrderIso: props.lastOrderByArticle[a.id]?.date ?? null,
    };
  }

  function handlePrint() {
    const sections: PrintSection[] = [];
    // Wein-Sammelliste zuoberst, wenn ausgewählt.
    if (selected.has(WINE_KEY)) {
      const bySupplier = new Map<string, PrintArticle[]>();
      for (const a of activeArticlesByLoc) {
        if ((a.category ?? "").trim() !== WINE_CATEGORY) continue;
        const arr = bySupplier.get(a.supplier_id) ?? [];
        arr.push(toPrintArticle(a));
        bySupplier.set(a.supplier_id, arr);
      }
      const groups = [...bySupplier.entries()].map(([sid, arts]) => ({
        supplierName: supplierNameById.get(sid) ?? "Lieferant",
        articles: arts,
      }));
      sections.push({ kind: "wine", title: "Wein-Sammelliste", bySupplier: groups });
    }
    // Lieferanten-Abschnitte in alphabetischer Reihenfolge.
    for (const s of activeSuppliers) {
      if (!selected.has(s.id)) continue;
      const arts = activeArticlesByLoc.filter((a) => a.supplier_id === s.id).map(toPrintArticle);
      sections.push({ kind: "supplier", supplierName: s.name, articles: arts });
    }
    if (sections.length === 0) return;
    printOrderLists({ locationName: props.locationName, sections });
    props.onClose();
  }

  const canPrint = selected.size > 0 && !!props.locationId;

  return (
    <Dialog open={props.open} onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Drucklisten – Bestandsaufnahme</DialogTitle>
        </DialogHeader>
        {!props.locationId ? (
          <p className="text-sm text-destructive">Bitte zuerst oben einen Standort wählen.</p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Standort: {props.locationName}</span>
              <button type="button" onClick={clearAll} className="text-primary hover:underline">
                Alle abwählen
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-auto">
              {wineCount > 0 && (
                <>
                  <label className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(WINE_KEY)}
                      onChange={() => toggle(WINE_KEY)}
                    />
                    <span className="flex-1 font-medium">Wein-Sammelliste (alle Lieferanten)</span>
                    <span className="text-xs text-muted-foreground">{wineCount}</span>
                  </label>
                  <div className="my-2 border-t border-border" />
                </>
              )}
              {activeSuppliers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Keine aktiven Lieferanten mit Artikeln für diesen Standort.
                </p>
              )}
              {activeSuppliers.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {countBySupplier.get(s.id) ?? 0}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!canPrint}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Drucken
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
