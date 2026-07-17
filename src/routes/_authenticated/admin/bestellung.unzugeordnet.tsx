// BM1 UI: Postfach-Eingang für Antworten ohne Bestellzuordnung.
// Manager+ kann jede unzugeordnete Mail einer Bestellung der letzten 90
// Tage manuell zuweisen (assignOrderReply).

import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  assignOrderReply,
  listOrderReplies,
  markOrderReplyRead,
  type OrderReplyRow,
} from "@/lib/bestellung/order-replies.functions";
import { listOrders } from "@/lib/bestellung/orders.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { ReplyCard } from "@/components/bestellung/OrderRepliesSection";

export const Route = createFileRoute("/_authenticated/admin/bestellung/unzugeordnet")({
  head: () => ({ meta: [{ title: "Unzugeordnet · Bestellung" }] }),
  component: UnzugeordnetPage,
});

function UnzugeordnetPage() {
  const qc = useQueryClient();
  const callAssign = useServerFn(assignOrderReply);
  const callMarkRead = useServerFn(markOrderReplyRead);

  const repliesQ = useQuery({
    queryKey: ["bestellung", "replies", { unassigned: true }],
    queryFn: () => listOrderReplies({ data: { unassignedOnly: true } }),
  });
  const ordersQ = useQuery({
    queryKey: ["bestellung", "orders", { recent: true }],
    queryFn: () => listOrders({ data: {} }),
  });
  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: true }],
    queryFn: () => listSuppliers({ data: { includeInactive: true } }),
  });
  const supplierName = useCallback(
    (id: string) => suppliersQ.data?.find((s) => s.id === id)?.name ?? "—",
    [suppliersQ.data],
  );

  const [selected, setSelected] = useState<OrderReplyRow | null>(null);
  const [orderQuery, setOrderQuery] = useState("");

  const assign = useMutation({
    mutationFn: (input: { replyId: string; orderId: string }) => callAssign({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bestellung", "replies"] });
      setSelected(null);
    },
  });

  const filteredOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    const orders = ordersQ.data ?? [];
    if (!q) return orders.slice(0, 30);
    return orders
      .filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          supplierName(o.supplier_id).toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [ordersQ.data, orderQuery, supplierName]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Antworten, die COCO keiner Bestellung zuordnen konnte. Zuordnung ist manuell.
      </p>
      {repliesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : (repliesQ.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Postfach leer.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {(repliesQ.data ?? []).map((r) => (
            <div key={r.id} className="space-y-1">
              <ReplyCard
                reply={r}
                onOpen={() => {
                  if (!r.read_at) callMarkRead({ data: { replyId: r.id } });
                }}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                >
                  Bestellung zuordnen …
                </button>
              </div>
            </div>
          ))}
        </ul>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-lg border border-border bg-card p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Antwort einer Bestellung zuordnen
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Schließen
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Von: {selected.from_email} · Betreff: {selected.subject ?? "(ohne)"}
            </p>
            <input
              type="text"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              placeholder="Bestellnummer oder Lieferant …"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <div className="max-h-64 overflow-auto rounded border border-border">
              {filteredOrders.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Keine passende Bestellung.</p>
              ) : (
                <ul className="divide-y divide-border text-xs">
                  {filteredOrders.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={assign.isPending}
                        onClick={() => assign.mutate({ replyId: selected.id, orderId: o.id })}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                      >
                        <span className="font-mono text-foreground">{o.order_number}</span>
                        <span className="text-muted-foreground">
                          {supplierName(o.supplier_id)} · {o.created_at?.slice(0, 10)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {assign.error && (
              <p className="text-xs text-destructive">{(assign.error as Error).message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
