// Bestellübersicht (Welle 1-C). Liste mit Status-Filter, Detail-Aufklapp,
// Stornieren (Manager+). E-Mail-Versand folgt in Welle 1-D.

import { useMemo, useState } from "react";
import type React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatShortDateTime } from "@/lib/format-date";
import {
  cancelOrder,
  getOrder,
  listOrders,
  sendOrderEmail,
} from "@/lib/bestellung/orders.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";

export const Route = createFileRoute("/_authenticated/admin/bestellung/bestellungen")({
  head: () => ({ meta: [{ title: "Bestellhistorie · Bestellung" }] }),
  component: BestellungenPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen",
  sent: "Versendet",
  confirmed: "Bestätigt",
  cancelled: "Storniert",
};

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function BestellungenPage() {
  const qc = useQueryClient();
  const callCancel = useServerFn(cancelOrder);
  const callSend = useServerFn(sendOrderEmail);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [emailLogOrder, setEmailLogOrder] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: true }],
    queryFn: () => listSuppliers({ data: { includeInactive: true } }),
  });
  const ordersQ = useQuery({
    queryKey: ["bestellung", "orders", { status: statusFilter, supplier: supplierFilter }],
    queryFn: () =>
      listOrders({
        data: {
          status: (statusFilter || undefined) as
            | "pending"
            | "sent"
            | "confirmed"
            | "cancelled"
            | undefined,
          supplierId: supplierFilter || undefined,
        },
      }),
  });

  const suppliersById = useMemo(() => {
    const m = new Map<string, { name: string; email: string | null }>();
    for (const s of suppliersQ.data ?? []) m.set(s.id, { name: s.name, email: s.email });
    return m;
  }, [suppliersQ.data]);

  const cancelMut = useMutation({
    mutationFn: (orderId: string) => callCancel({ data: { orderId } }),
    onSuccess: () => {
      setMsg("Bestellung storniert.");
      qc.invalidateQueries({ queryKey: ["bestellung", "orders"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const sendMut = useMutation({
    mutationFn: (orderId: string) => callSend({ data: { orderId } }),
    onSuccess: (_res, orderId) => {
      const supplierName = (() => {
        const o = ordersQ.data?.find((x) => x.id === orderId);
        return o ? (suppliersById.get(o.supplier_id)?.name ?? "Lieferant") : "Lieferant";
      })();
      setMsg(`Bestellung an ${supplierName} gesendet.`);
      qc.invalidateQueries({ queryKey: ["bestellung", "orders"] });
      qc.invalidateQueries({ queryKey: ["bestellung", "order"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">Alle</option>
            <option value="pending">Offen</option>
            <option value="sent">Versendet</option>
            <option value="confirmed">Bestätigt</option>
            <option value="cancelled">Storniert</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">Lieferant</span>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">Alle</option>
            {(suppliersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {msg && <p className="text-sm text-foreground">{msg}</p>}

      {ordersQ.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
      {ordersQ.data && ordersQ.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Bestellungen.</p>
      )}

      {ordersQ.data && ordersQ.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nr.</th>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Lieferant</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Versendet am</th>
                <th className="px-3 py-2 text-right">Summe</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ordersQ.data.flatMap((o) => {
                const row = (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono">{o.order_number}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatShortDateTime(o.created_at)}
                    </td>
                    <td className="px-3 py-2">{suppliersById.get(o.supplier_id)?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          o.status === "cancelled"
                            ? "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            : o.status === "pending"
                              ? "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                              : "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        }
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() =>
                          setEmailLogOrder(emailLogOrder === o.id ? null : o.id)
                        }
                        className={
                          "rounded px-2 py-0.5 text-xs underline-offset-2 hover:underline " +
                          (o.email_error
                            ? "bg-destructive/10 text-destructive"
                            : o.email_sent
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-muted text-muted-foreground")
                        }
                        title="E-Mail-Verlauf anzeigen"
                      >
                        {o.email_error ? "Fehler" : o.email_sent ? "ja" : "nein"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {o.email_sent_at ? formatShortDateTime(o.email_sent_at) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtEuro(o.total_amount_cents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {o.status !== "cancelled" && (
                          <button
                            onClick={() => sendMut.mutate(o.id)}
                            disabled={sendMut.isPending || !suppliersById.get(o.supplier_id)?.email}
                            title={
                              !suppliersById.get(o.supplier_id)?.email
                                ? "Lieferant hat keine E-Mail-Adresse hinterlegt"
                                : undefined
                            }
                            className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                          >
                            {o.email_sent ? "Erneut senden" : "Per E-Mail senden"}
                          </button>
                        )}
                        <button
                          onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                          className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                        >
                          {expanded === o.id ? "Schließen" : "Details"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                const extra: React.ReactNode[] = [];
                if (emailLogOrder === o.id) {
                  extra.push(
                    <tr key={o.id + "-email"} className="border-t border-border bg-muted/10">
                      <td colSpan={8} className="px-3 py-3">
                        <EmailDeliveryTimeline
                          sent={o.email_sent}
                          sentAt={o.email_sent_at}
                          messageId={o.email_message_id}
                          error={o.email_error}
                        />
                      </td>
                    </tr>,
                  );
                }
                if (expanded === o.id) {
                  extra.push(
                    <tr key={o.id + "-detail"} className="border-t border-border bg-muted/10">
                      <td colSpan={8} className="px-3 py-4">
                      <OrderDetail
                        orderId={o.id}
                        canCancel={o.status !== "cancelled"}
                        onCancel={() => cancelMut.mutate(o.id)}
                        cancelling={cancelMut.isPending}
                        supplierHasEmail={!!suppliersById.get(o.supplier_id)?.email}
                        canResend={o.status !== "cancelled"}
                        onResend={() => sendMut.mutate(o.id)}
                        resending={sendMut.isPending}
                      />
                      </td>
                    </tr>,
                  );
                }
                return [row, ...extra];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderDetail(props: {
  orderId: string;
  canCancel: boolean;
  onCancel: () => void;
  cancelling: boolean;
  supplierHasEmail: boolean;
  canResend: boolean;
  onResend: () => void;
  resending: boolean;
}) {
  const detailQ = useQuery({
    queryKey: ["bestellung", "order", props.orderId],
    queryFn: () => getOrder({ data: { orderId: props.orderId } }),
  });
  if (detailQ.isLoading) return <p className="text-sm text-muted-foreground">Lädt …</p>;
  if (!detailQ.data) return null;
  const { order, items } = detailQ.data;
  return (
    <div className="space-y-3">
      {!props.supplierHasEmail && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          Kein E-Mail-Versand möglich — Lieferant hat keine Adresse.
        </p>
      )}
      {order.email_error && (
        <div className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive space-y-1">
          <p className="font-medium uppercase tracking-wide">E-Mail-Versand fehlgeschlagen</p>
          <p className="whitespace-pre-wrap font-mono text-foreground">{order.email_error}</p>
          <p className="text-muted-foreground">
            {order.email_sent_at ? `Zeitpunkt: ${formatShortDateTime(order.email_sent_at)}` : "Zeitpunkt: —"}
            {order.email_message_id ? ` · Message-ID: ${order.email_message_id}` : ""}
          </p>
          {props.canResend && (
            <div className="pt-1">
              <button
                type="button"
                onClick={props.onResend}
                disabled={props.resending || !props.supplierHasEmail}
                title={
                  !props.supplierHasEmail
                    ? "Lieferant hat keine E-Mail-Adresse hinterlegt"
                    : undefined
                }
                className="rounded border border-destructive/40 bg-background px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                {props.resending ? "Sende …" : "E-Mail erneut senden"}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-xs">
        <div>
          <p className="uppercase tracking-wide text-muted-foreground">Lieferdatum</p>
          <p className="text-foreground">
            {order.delivery_date ?? "—"}
            {order.time_window ? ` · ${order.time_window}` : ""}
          </p>
        </div>
        <div className="md:col-span-2">
          <p className="uppercase tracking-wide text-muted-foreground">Lieferadresse</p>
          <pre className="whitespace-pre-wrap font-sans text-foreground">
            {order.delivery_address ?? "—"}
          </pre>
        </div>
      </div>
      {order.notes && (
        <div className="text-xs">
          <p className="uppercase tracking-wide text-muted-foreground">Notiz</p>
          <p className="text-foreground">{order.notes}</p>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1">Artikel</th>
            <th className="px-2 py-1">SKU</th>
            <th className="px-2 py-1 text-right">Menge</th>
            <th className="px-2 py-1">Einheit</th>
            <th className="px-2 py-1 text-right">Einzel</th>
            <th className="px-2 py-1 text-right">Summe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t border-border">
              <td className="px-2 py-1">
                {it.article_name}
                {it.is_free_text_item && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    Freitext
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-muted-foreground">{it.sku ?? "—"}</td>
              <td className="px-2 py-1 text-right">{it.quantity}</td>
              <td className="px-2 py-1 text-muted-foreground">{it.unit}</td>
              <td className="px-2 py-1 text-right font-mono">{fmtEuro(it.unit_price_cents)}</td>
              <td className="px-2 py-1 text-right font-mono">{fmtEuro(it.total_price_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <p className="text-sm">
          Gesamt: <span className="font-mono font-medium">{fmtEuro(order.total_amount_cents)}</span>
        </p>
        <div className="flex items-center gap-2">
          {props.canResend && (
            <button
              type="button"
              onClick={props.onResend}
              disabled={props.resending || !props.supplierHasEmail}
              title={
                !props.supplierHasEmail
                  ? "Lieferant hat keine E-Mail-Adresse hinterlegt"
                  : undefined
              }
              className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              {props.resending
                ? "Sende …"
                : order.email_sent
                  ? "E-Mail erneut senden"
                  : "Per E-Mail senden"}
            </button>
          )}
          {props.canCancel && (
            <button
              onClick={props.onCancel}
              disabled={props.cancelling}
              className="rounded border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Bestellung stornieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const selectCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function EmailDeliveryTimeline(props: {
  sent: boolean;
  sentAt: string | null;
  messageId: string | null;
  error: string | null;
}) {
  const steps: { label: string; ts: string | null; tone: "ok" | "err" | "muted" }[] = [
    { label: "Bestellung erstellt", ts: null, tone: "muted" },
    {
      label: props.error ? "Versand fehlgeschlagen" : props.sent ? "An Mail-Server übergeben" : "Noch nicht versendet",
      ts: props.sentAt,
      tone: props.error ? "err" : props.sent ? "ok" : "muted",
    },
  ];
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium uppercase tracking-wide text-muted-foreground">
        E-Mail-Zustellung
      </p>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className={
                "mt-1 inline-block h-2 w-2 rounded-full " +
                (s.tone === "ok"
                  ? "bg-green-500"
                  : s.tone === "err"
                    ? "bg-destructive"
                    : "bg-muted-foreground/40")
              }
            />
            <span className="flex-1">
              <span className="text-foreground">{s.label}</span>
              {s.ts && (
                <span className="ml-2 text-muted-foreground">{formatShortDateTime(s.ts)}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {props.messageId && (
        <p className="text-muted-foreground">
          Message-ID: <span className="font-mono text-foreground">{props.messageId}</span>
        </p>
      )}
      {props.error && (
        <p className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1 text-destructive">
          {props.error}
        </p>
      )}
      {!props.sent && !props.error && (
        <p className="text-muted-foreground">
          Noch kein Versand-Versuch — über „Per E-Mail senden" auslösen.
        </p>
      )}
    </div>
  );
}
