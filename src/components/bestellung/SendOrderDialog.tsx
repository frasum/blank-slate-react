// Vorschau-Dialog: zeigt eine Bestellung pro Lieferant, prüft Pflichtfelder
// (Standort, Liefer-E-Mail) und löst dann createOrderFromCart({supplierId})
// + sendOrderEmail in einem Schritt aus. Wird sowohl aus dem Lieferanten-
// Header als auch aus dem CartDrawer aufgerufen.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getActiveCart, setCartMeta } from "@/lib/bestellung/cart.functions";
import { createOrderFromCart, sendOrderEmail } from "@/lib/bestellung/orders.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listArticles } from "@/lib/bestellung/articles.functions";
import { listLocations } from "@/lib/admin/locations.functions";

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  onSent?: (orderId: string) => void;
};

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SendOrderDialog({ open, onOpenChange, supplierId, onSent }: Props) {
  const qc = useQueryClient();
  const callOrder = useServerFn(createOrderFromCart);
  const callSend = useServerFn(sendOrderEmail);
  const callMeta = useServerFn(setCartMeta);

  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
  const locationsQ = useQuery({
    queryKey: ["bestellung", "locations"],
    queryFn: () => listLocations(),
  });

  const supplier = (suppliersQ.data ?? []).find((s) => s.id === supplierId);
  const cart = cartQ.data?.cart;
  const allItems = cartQ.data?.items ?? [];
  const items = allItems.filter((it) => it.supplier_id === supplierId);

  const articlesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; unit: string; price_cents: number }>();
    for (const a of articlesQ.data ?? []) m.set(a.id, a);
    return m;
  }, [articlesQ.data]);

  const rows = items.map((it) => {
    const a = it.article_id ? articlesById.get(it.article_id) : undefined;
    const name = it.is_free_text_item ? (it.free_text_name ?? "Freitext") : (a?.name ?? "—");
    const unit = it.is_free_text_item ? (it.free_text_unit ?? "Stk") : (a?.unit ?? "—");
    const unitPrice = it.is_free_text_item ? 0 : (a?.price_cents ?? 0);
    return {
      id: it.id,
      name,
      unit,
      quantity: it.quantity,
      unitPriceCents: unitPrice,
      totalCents: unitPrice * it.quantity,
      isFreeText: it.is_free_text_item,
    };
  });
  const totalCents = rows.reduce((s, r) => s + r.totalCents, 0);

  const sendMut = useMutation({
    mutationFn: async () => {
      setErr(null);
      const created = await callOrder({
        data: { supplierId, notes: notes.trim() || undefined },
      });
      const orderId = created.orderIds[0];
      if (!orderId) throw new Error("Keine Bestellung angelegt.");
      await callSend({ data: { orderId } });
      return orderId;
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: ["bestellung", "cart"] });
      qc.invalidateQueries({ queryKey: ["bestellung", "orders"] });
      qc.invalidateQueries({ queryKey: ["bestellung", "last-order-by-article"] });
      setNotes("");
      onSent?.(orderId);
      onOpenChange(false);
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Versand fehlgeschlagen."),
  });

  const metaMut = useMutation({
    mutationFn: (input: Parameters<typeof callMeta>[0]) => callMeta(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bestellung", "cart"] }),
  });

  const noEmail = !supplier?.email;
  const noLocation = !cart?.location_id;
  const empty = rows.length === 0;
  const blocked = noEmail || noLocation || empty || sendMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bestellung an {supplier?.name ?? "Lieferant"}</DialogTitle>
          <DialogDescription>
            Vorschau prüfen, dann verbindlich per E-Mail senden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
            <div>
              <p className="uppercase tracking-wide text-muted-foreground">Empfänger</p>
              <p className="text-foreground">{supplier?.name ?? "—"}</p>
              <p className={noEmail ? "text-destructive" : "text-muted-foreground"}>
                {supplier?.email ?? "Keine E-Mail hinterlegt"}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="uppercase tracking-wide text-muted-foreground">Standort</p>
              <select
                value={cart?.location_id ?? ""}
                onChange={(e) => metaMut.mutate({ data: { locationId: e.target.value || null } })}
                className={inputCls}
              >
                <option value="">— wählen —</option>
                {(locationsQ.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="uppercase tracking-wide text-muted-foreground">Lieferdatum</span>
                  <input
                    type="date"
                    value={cart?.delivery_date ?? ""}
                    onChange={(e) =>
                      metaMut.mutate({ data: { deliveryDate: e.target.value || null } })
                    }
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="uppercase tracking-wide text-muted-foreground">Zeitfenster</span>
                  <input
                    value={cart?.time_window ?? ""}
                    onChange={(e) =>
                      metaMut.mutate({ data: { timeWindow: e.target.value || null } })
                    }
                    placeholder="z. B. 08:00–10:00"
                    className={inputCls}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Artikel</th>
                  <th className="px-3 py-2">Einheit</th>
                  <th className="px-3 py-2 text-right">Menge</th>
                  <th className="px-3 py-2 text-right">Einzel</th>
                  <th className="px-3 py-2 text-right">Summe</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Keine Artikel für diesen Lieferanten im Warenkorb.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        {r.name}
                        {r.isFreeText && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            Freitext
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                      <td className="px-3 py-2 text-right">{r.quantity}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.isFreeText ? "—" : fmtEuro(r.unitPriceCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.isFreeText ? "—" : fmtEuro(r.totalCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium">
                    Gesamt
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {fmtEuro(totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              Notiz an Lieferant (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>

          {noEmail && (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Beim Lieferanten ist keine E-Mail-Adresse hinterlegt — Versand nicht möglich.
            </p>
          )}
          {noLocation && !noEmail && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Bitte zuerst einen Standort wählen.
            </p>
          )}
          {err && (
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {err}
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => sendMut.mutate()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sendMut.isPending ? "Sende …" : "Verbindlich senden"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
