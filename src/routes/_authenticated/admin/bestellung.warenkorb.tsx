// Warenkorb (Welle 1-C). Artikel hinzufügen, Mengen ändern, gruppiert nach
// Lieferant anzeigen, Standort + Lieferdatum setzen, Entwurf speichern/laden,
// Bestellung auslösen (createOrderFromCart → Manager+).
// Preise nur als Anzeige (Cent → Euro). Freitext-Artikel sind möglich.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addCartItem,
  clearCart,
  deleteCartDraft,
  getActiveCart,
  listCartDrafts,
  loadDraftIntoCart,
  removeCartItem,
  saveCartAsDraft,
  setCartMeta,
  updateCartItem,
} from "@/lib/bestellung/cart.functions";
import { createOrderFromCart } from "@/lib/bestellung/orders.functions";
import { listArticles } from "@/lib/bestellung/articles.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listLocations } from "@/lib/admin/locations.functions";

export const Route = createFileRoute("/_authenticated/admin/bestellung/warenkorb")({
  head: () => ({ meta: [{ title: "Warenkorb · Bestellung" }] }),
  component: WarenkorbPage,
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

function WarenkorbPage() {
  const qc = useQueryClient();
  const callAdd = useServerFn(addCartItem);
  const callUpdate = useServerFn(updateCartItem);
  const callRemove = useServerFn(removeCartItem);
  const callClear = useServerFn(clearCart);
  const callMeta = useServerFn(setCartMeta);
  const callSaveDraft = useServerFn(saveCartAsDraft);
  const callLoadDraft = useServerFn(loadDraftIntoCart);
  const callDeleteDraft = useServerFn(deleteCartDraft);
  const callOrder = useServerFn(createOrderFromCart);

  const [msg, setMsg] = useState<string | null>(null);
  const [pickerSupplier, setPickerSupplier] = useState<string>("");
  const [pickerArticle, setPickerArticle] = useState<string>("");
  const [pickerQty, setPickerQty] = useState<number>(1);
  const [ftName, setFtName] = useState("");
  const [ftUnit, setFtUnit] = useState("Stk");
  const [ftQty, setFtQty] = useState<number>(1);
  const [draftName, setDraftName] = useState("Entwurf");
  const [notes, setNotes] = useState("");

  const cartQ = useQuery({
    queryKey: ["bestellung", "cart"],
    queryFn: () => getActiveCart(),
  });
  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: false }],
    queryFn: () => listSuppliers({ data: { includeInactive: false } }),
  });
  const articlesQ = useQuery({
    queryKey: ["bestellung", "articles", { supplier: pickerSupplier, includeInactive: false }],
    queryFn: () =>
      listArticles({
        data: { supplierId: pickerSupplier || undefined, includeInactive: false },
      }),
    enabled: !!pickerSupplier,
  });
  const allArticlesQ = useQuery({
    queryKey: ["bestellung", "articles", "all"],
    queryFn: () => listArticles({ data: { includeInactive: true } }),
  });
  const locationsQ = useQuery({
    queryKey: ["bestellung", "locations"],
    queryFn: () => listLocations(),
  });
  const draftsQ = useQuery({
    queryKey: ["bestellung", "drafts"],
    queryFn: () => listCartDrafts(),
  });

  const suppliersById = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; email: string | null; min_order_value_cents: number | null }
    >();
    for (const s of suppliersQ.data ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);
  const articlesById = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; unit: string; price_cents: number; supplier_id: string }
    >();
    for (const a of allArticlesQ.data ?? []) m.set(a.id, a);
    return m;
  }, [allArticlesQ.data]);

  const refreshCart = () => qc.invalidateQueries({ queryKey: ["bestellung", "cart"] });

  const addMut = useMutation({
    mutationFn: (input: Parameters<typeof callAdd>[0]) => callAdd(input),
    onSuccess: () => {
      setMsg(null);
      setPickerArticle("");
      setPickerQty(1);
      setFtName("");
      setFtQty(1);
      refreshCart();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const updateMut = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) => callUpdate({ data: input }),
    onSuccess: refreshCart,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const removeMut = useMutation({
    mutationFn: (itemId: string) => callRemove({ data: { itemId } }),
    onSuccess: refreshCart,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const clearMut = useMutation({
    mutationFn: () => callClear(),
    onSuccess: refreshCart,
  });
  const metaMut = useMutation({
    mutationFn: (input: Parameters<typeof callMeta>[0]) => callMeta(input),
    onSuccess: refreshCart,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const saveDraftMut = useMutation({
    mutationFn: (input: Parameters<typeof callSaveDraft>[0]) => callSaveDraft(input),
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
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const deleteDraftMut = useMutation({
    mutationFn: (draftId: string) => callDeleteDraft({ data: { draftId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bestellung", "drafts"] }),
  });
  const orderMut = useMutation({
    mutationFn: (input: Parameters<typeof callOrder>[0]) => callOrder(input),
    onSuccess: (res) => {
      setMsg(`Bestellung(en) angelegt: ${res.orderIds.length}`);
      refreshCart();
      qc.invalidateQueries({ queryKey: ["bestellung", "orders"] });
      setNotes("");
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const cart = cartQ.data?.cart;
  const items = cartQ.data?.items ?? [];

  // Gruppieren nach supplier_id für Anzeige + Summen.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { supplierId: string; rows: typeof items; subtotalCents: number }
    >();
    for (const it of items) {
      const sid = it.supplier_id ?? "—";
      const a = it.article_id ? articlesById.get(it.article_id) : undefined;
      const unitPrice = it.is_free_text_item ? 0 : (a?.price_cents ?? 0);
      const g = map.get(sid) ?? { supplierId: sid, rows: [], subtotalCents: 0 };
      g.rows.push(it);
      g.subtotalCents += unitPrice * it.quantity;
      map.set(sid, g);
    }
    return Array.from(map.values());
  }, [items, articlesById]);

  const totalCents = groups.reduce((s, g) => s + g.subtotalCents, 0);

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm text-foreground">{msg}</p>}

      {/* Cart-Meta */}
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lieferung
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">Standort *</span>
            <select
              value={cart?.location_id ?? ""}
              onChange={(e) => metaMut.mutate({ data: { locationId: e.target.value || null } })}
              className={selectCls}
            >
              <option value="">— wählen —</option>
              {(locationsQ.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">Lieferdatum</span>
            <input
              type="date"
              value={cart?.delivery_date ?? ""}
              onChange={(e) => metaMut.mutate({ data: { deliveryDate: e.target.value || null } })}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">Zeitfenster</span>
            <input
              value={cart?.time_window ?? ""}
              onChange={(e) => metaMut.mutate({ data: { timeWindow: e.target.value || null } })}
              placeholder="z. B. 08:00–10:00"
              className={inputCls}
            />
          </label>
        </div>
      </section>

      {/* Add picker */}
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Artikel hinzufügen
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_120px_auto]">
          <select
            value={pickerSupplier}
            onChange={(e) => {
              setPickerSupplier(e.target.value);
              setPickerArticle("");
            }}
            className={selectCls}
          >
            <option value="">Lieferant wählen …</option>
            {(suppliersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={pickerArticle}
            onChange={(e) => setPickerArticle(e.target.value)}
            className={selectCls}
            disabled={!pickerSupplier}
          >
            <option value="">Artikel wählen …</option>
            {(articlesQ.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {fmtEuro(a.price_cents)} / {a.unit}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={pickerQty}
            onChange={(e) => setPickerQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={inputCls}
          />
          <button
            disabled={!pickerArticle || addMut.isPending}
            onClick={() =>
              addMut.mutate({ data: { articleId: pickerArticle, quantity: pickerQty } })
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            + Hinzufügen
          </button>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Freitext-Artikel
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_120px_120px_auto]">
            <select
              value={pickerSupplier}
              onChange={(e) => setPickerSupplier(e.target.value)}
              className={selectCls}
            >
              <option value="">Lieferant …</option>
              {(suppliersQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={ftName}
              onChange={(e) => setFtName(e.target.value)}
              placeholder="Artikelname (Freitext)"
              className={inputCls}
            />
            <input
              value={ftUnit}
              onChange={(e) => setFtUnit(e.target.value)}
              placeholder="Einheit"
              className={inputCls}
            />
            <input
              type="number"
              min={1}
              value={ftQty}
              onChange={(e) => setFtQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls}
            />
            <button
              disabled={!pickerSupplier || !ftName.trim() || addMut.isPending}
              onClick={() =>
                addMut.mutate({
                  data: {
                    supplierId: pickerSupplier,
                    freeTextName: ftName.trim(),
                    freeTextUnit: ftUnit.trim() || "Stk",
                    quantity: ftQty,
                  },
                })
              }
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              + Freitext
            </button>
          </div>
        </div>
      </section>

      {/* Items by supplier */}
      <section className="space-y-4">
        {cartQ.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
        {items.length === 0 && !cartQ.isLoading && (
          <p className="text-sm text-muted-foreground">Warenkorb ist leer.</p>
        )}
        {groups.map((g) => {
          const sup = suppliersById.get(g.supplierId);
          const min = sup?.min_order_value_cents ?? null;
          const belowMin = min != null && g.subtotalCents < min;
          return (
            <div key={g.supplierId} className="rounded-md border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
                <div>
                  <p className="font-medium text-foreground">{sup?.name ?? "Unbekannt"}</p>
                  {sup?.email ? (
                    <p className="text-xs text-muted-foreground">{sup.email}</p>
                  ) : (
                    <p className="text-xs text-destructive">Keine E-Mail beim Lieferanten.</p>
                  )}
                </div>
                <div className="text-right text-sm">
                  <p className="font-mono">{fmtEuro(g.subtotalCents)}</p>
                  {min != null && (
                    <p
                      className={
                        belowMin ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                      }
                    >
                      Mindest: {fmtEuro(min)}
                    </p>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Artikel</th>
                    <th className="px-3 py-2">Einheit</th>
                    <th className="px-3 py-2 text-right">Preis</th>
                    <th className="px-3 py-2 text-center">Menge</th>
                    <th className="px-3 py-2 text-right">Summe</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((it) => {
                    const a = it.article_id ? articlesById.get(it.article_id) : undefined;
                    const name = it.is_free_text_item ? it.free_text_name : (a?.name ?? "—");
                    const unit = it.is_free_text_item ? it.free_text_unit : a?.unit;
                    const unitPrice = it.is_free_text_item ? null : (a?.price_cents ?? null);
                    const sum = (unitPrice ?? 0) * it.quantity;
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          {name}
                          {it.is_free_text_item && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              Freitext
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{unit ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {it.is_free_text_item ? "—" : fmtEuro(unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => {
                              const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                              if (q !== it.quantity) {
                                updateMut.mutate({ itemId: it.id, quantity: q });
                              }
                            }}
                            className="w-16 rounded border border-input bg-background px-2 py-1 text-center text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {it.is_free_text_item ? "—" : fmtEuro(sum)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeMut.mutate(it.id)}
                            className="text-xs text-destructive hover:underline"
                          >
                            entfernen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* Footer actions */}
      {items.length > 0 && (
        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Summe gesamt:{" "}
              <span className="font-mono font-medium text-foreground">{fmtEuro(totalCents)}</span>
            </p>
            <button
              onClick={() => clearMut.mutate(undefined)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Warenkorb leeren
            </button>
          </div>
          <label className="block space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              Notiz (an alle Lieferanten)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name des Entwurfs"
              className={inputCls + " max-w-[240px]"}
            />
            <button
              onClick={() =>
                saveDraftMut.mutate({ data: { name: draftName, notes: notes || undefined } })
              }
              disabled={saveDraftMut.isPending}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              Als Entwurf speichern
            </button>
            <div className="flex-1" />
            <button
              onClick={() => orderMut.mutate({ data: { notes: notes || undefined } })}
              disabled={orderMut.isPending || !cart?.location_id}
              className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {orderMut.isPending ? "Sende …" : "Bestellung anlegen"}
            </button>
          </div>
          {!cart?.location_id && (
            <p className="mt-2 text-xs text-destructive">Bitte zuerst Standort wählen.</p>
          )}
        </section>
      )}

      {/* Drafts */}
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Entwürfe
        </h2>
        {(draftsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Entwürfe gespeichert.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(draftsQ.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-foreground">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(d.updated_at).toLocaleString("de-DE")}
                    {d.desired_delivery_date ? ` · Lieferung ${d.desired_delivery_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
      </section>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const selectCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
