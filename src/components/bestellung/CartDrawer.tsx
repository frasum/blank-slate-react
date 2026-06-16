// Globaler Warenkorb-Drawer: persistenter Floating-Button unten rechts
// (zählt Lieferanten + Positionen), aufklappbar als Sheet von rechts.
// Pro Lieferant ein Block mit Mengen-Editor und "Bestellen"-Knopf, der
// SendOrderDialog öffnet. Ersetzt die separate /warenkorb-Route.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatShortDateTime } from "@/lib/format-date";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  clearCart,
  deleteCartDraft,
  getActiveCart,
  listCartDrafts,
  loadDraftIntoCart,
  removeCartItem,
  saveCartAsDraft,
  updateCartItem,
} from "@/lib/bestellung/cart.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listArticles } from "@/lib/bestellung/articles.functions";
import { SendOrderDialog } from "./SendOrderDialog";

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

export function CartDrawer() {
  const qc = useQueryClient();
  const callUpdate = useServerFn(updateCartItem);
  const callRemove = useServerFn(removeCartItem);
  const callClear = useServerFn(clearCart);
  const callSaveDraft = useServerFn(saveCartAsDraft);
  const callLoadDraft = useServerFn(loadDraftIntoCart);
  const callDeleteDraft = useServerFn(deleteCartDraft);

  const [open, setOpen] = useState(false);
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("Entwurf");
  const [msg, setMsg] = useState<string | null>(null);

  const cartQ = useQuery({
    queryKey: ["bestellung", "cart"],
    queryFn: () => getActiveCart(),
  });
  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: true }],
    queryFn: () => listSuppliers({ data: { includeInactive: true } }),
  });
  const articlesQ = useQuery({
    queryKey: ["bestellung", "articles", "all"],
    queryFn: () => listArticles({ data: { includeInactive: true } }),
  });
  const draftsQ = useQuery({
    queryKey: ["bestellung", "drafts"],
    queryFn: () => listCartDrafts(),
    enabled: open,
  });

  const refreshCart = () => qc.invalidateQueries({ queryKey: ["bestellung", "cart"] });

  const updateMut = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) => callUpdate({ data: input }),
    onSuccess: refreshCart,
  });
  const removeMut = useMutation({
    mutationFn: (itemId: string) => callRemove({ data: { itemId } }),
    onSuccess: refreshCart,
  });
  const clearMut = useMutation({
    mutationFn: () => callClear(),
    onSuccess: () => {
      setMsg("Warenkorb geleert.");
      refreshCart();
    },
  });
  const saveDraftMut = useMutation({
    mutationFn: () => callSaveDraft({ data: { name: draftName } }),
    onSuccess: () => {
      setMsg("Entwurf gespeichert.");
      qc.invalidateQueries({ queryKey: ["bestellung", "drafts"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const loadDraftMut = useMutation({
    mutationFn: (draftId: string) => callLoadDraft({ data: { draftId, replace: true } }),
    onSuccess: () => {
      setMsg("Entwurf geladen.");
      refreshCart();
    },
  });
  const deleteDraftMut = useMutation({
    mutationFn: (draftId: string) => callDeleteDraft({ data: { draftId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bestellung", "drafts"] }),
  });

  const items = useMemo(() => cartQ.data?.items ?? [], [cartQ.data?.items]);
  const suppliersById = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; email: string | null; min_order_value_cents: number | null }
    >();
    for (const s of suppliersQ.data ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);
  const articlesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; unit: string; price_cents: number }>();
    for (const a of articlesQ.data ?? []) m.set(a.id, a);
    return m;
  }, [articlesQ.data]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierId: string;
        rows: Array<{
          id: string;
          name: string;
          unit: string;
          quantity: number;
          unitPriceCents: number;
          totalCents: number;
          isFreeText: boolean;
        }>;
        subtotalCents: number;
        count: number;
      }
    >();
    for (const it of items) {
      const sid = it.supplier_id ?? "—";
      const a = it.article_id ? articlesById.get(it.article_id) : undefined;
      const name = it.is_free_text_item ? (it.free_text_name ?? "Freitext") : (a?.name ?? "—");
      const unit = it.is_free_text_item ? (it.free_text_unit ?? "Stk") : (a?.unit ?? "—");
      const unitPrice = it.is_free_text_item ? 0 : (a?.price_cents ?? 0);
      const g = map.get(sid) ?? { supplierId: sid, rows: [], subtotalCents: 0, count: 0 };
      g.rows.push({
        id: it.id,
        name,
        unit,
        quantity: it.quantity,
        unitPriceCents: unitPrice,
        totalCents: unitPrice * it.quantity,
        isFreeText: it.is_free_text_item,
      });
      g.subtotalCents += unitPrice * it.quantity;
      g.count += it.quantity;
      map.set(sid, g);
    }
    return Array.from(map.values());
  }, [items, articlesById]);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const supplierCount = groups.length;
  const totalCents = groups.reduce((s, g) => s + g.subtotalCents, 0);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
            aria-label="Warenkorb öffnen"
          >
            <span aria-hidden>🛒</span>
            {totalItems === 0 ? (
              <span>Warenkorb</span>
            ) : (
              <span>
                {supplierCount} {supplierCount === 1 ? "Lieferant" : "Lieferanten"} · {totalItems}{" "}
                Pos. · {fmtEuro(totalCents)}
              </span>
            )}
          </button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Warenkorb</SheetTitle>
            <SheetDescription>
              Pro Lieferant prüfen und bestellen. Versand direkt aus dem Vorschau-Dialog.
            </SheetDescription>
          </SheetHeader>

          {msg && <p className="mt-3 text-sm text-foreground">{msg}</p>}

          <div className="mt-4 space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Warenkorb ist leer. Artikel im Lieferanten-Tab in den Korb legen.
              </p>
            )}

            {groups.map((g) => {
              const sup = suppliersById.get(g.supplierId);
              const min = sup?.min_order_value_cents ?? null;
              const belowMin = min != null && g.subtotalCents < min;
              return (
                <div key={g.supplierId} className="rounded-md border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="font-medium text-foreground">{sup?.name ?? "Unbekannt"}</p>
                      <p
                        className={
                          sup?.email ? "text-xs text-muted-foreground" : "text-xs text-destructive"
                        }
                      >
                        {sup?.email ?? "Keine E-Mail beim Lieferanten."}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="font-mono">{fmtEuro(g.subtotalCents)}</p>
                        {min != null && (
                          <p
                            className={
                              belowMin
                                ? "text-xs text-destructive"
                                : "text-xs text-muted-foreground"
                            }
                          >
                            MBW {fmtEuro(min)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!sup?.email}
                        onClick={() => setSendFor(g.supplierId)}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Bestellen
                      </button>
                    </div>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.rows.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">
                            {r.name}
                            {r.isFreeText && (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                Freitext
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.unit} · {r.isFreeText ? "—" : fmtEuro(r.unitPriceCents)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (r.quantity <= 1) removeMut.mutate(r.id);
                              else updateMut.mutate({ itemId: r.id, quantity: r.quantity - 1 });
                            }}
                            className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground hover:bg-accent"
                            aria-label="Menge verringern"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{r.quantity}</span>
                          <button
                            onClick={() =>
                              updateMut.mutate({ itemId: r.id, quantity: r.quantity + 1 })
                            }
                            className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground hover:bg-accent"
                            aria-label="Menge erhöhen"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeMut.mutate(r.id)}
                            className="ml-2 text-xs text-muted-foreground hover:text-destructive"
                            aria-label="Entfernen"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {groups.length > 0 && (
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">
                  Gesamt:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {fmtEuro(totalCents)}
                  </span>
                </span>
                <button
                  onClick={() => clearMut.mutate()}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Warenkorb leeren
                </button>
              </div>
            )}

            {/* Entwürfe */}
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Entwürfe
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Name des Entwurfs"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => saveDraftMut.mutate()}
                    disabled={saveDraftMut.isPending || items.length === 0}
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    Speichern
                  </button>
                </div>
                {(draftsQ.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine Entwürfe gespeichert.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {(draftsQ.data ?? []).map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-foreground">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatShortDateTime(d.updated_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => loadDraftMut.mutate(d.id)}
                            className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                          >
                            Laden
                          </button>
                          <button
                            onClick={() => deleteDraftMut.mutate(d.id)}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            löschen
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </div>
        </SheetContent>
      </Sheet>

      {sendFor && (
        <SendOrderDialog
          open={!!sendFor}
          onOpenChange={(o) => {
            if (!o) setSendFor(null);
          }}
          supplierId={sendFor}
          onSent={() => setMsg("Bestellung versendet.")}
        />
      )}
    </>
  );
}
