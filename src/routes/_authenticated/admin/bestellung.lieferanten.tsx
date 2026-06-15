// Lieferanten-Verwaltung (Welle 1-B).
// Liste + Inline-Bearbeitung + Anlegen via Dialog. Manager+ darf alles.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createSupplier,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
} from "@/lib/bestellung/suppliers.functions";

export const Route = createFileRoute("/_authenticated/admin/bestellung/lieferanten")({
  head: () => ({ meta: [{ title: "Lieferanten · Bestellung" }] }),
  component: LieferantenPage,
});

type SupplierDraft = {
  name: string;
  email: string;
  phone: string;
  address: string;
  customerNumber: string;
  contactPerson: string;
  notes: string;
  deliveryDays: string[];
  orderDeadline: string;
  minOrderValueEuro: string;
  sortOrder: number;
};

const EMPTY_DRAFT: SupplierDraft = {
  name: "",
  email: "",
  phone: "",
  address: "",
  customerNumber: "",
  contactPerson: "",
  notes: "",
  deliveryDays: [],
  orderDeadline: "",
  minOrderValueEuro: "",
  sortOrder: 0,
};

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

function LieferantenPage() {
  const qc = useQueryClient();
  const callCreate = useServerFn(createSupplier);
  const callUpdate = useServerFn(updateSupplier);
  const callToggle = useServerFn(setSupplierActive);
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: showInactive }],
    queryFn: () => listSuppliers({ data: { includeInactive: showInactive } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["bestellung", "suppliers"] });

  const createMut = useMutation({
    mutationFn: (draft: SupplierDraft) =>
      callCreate({
        data: {
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          address: draft.address,
          customerNumber: draft.customerNumber,
          contactPerson: draft.contactPerson,
          notes: draft.notes,
          deliveryDays: draft.deliveryDays.length ? draft.deliveryDays : null,
          orderDeadline: draft.orderDeadline,
          minOrderValueCents: parseEuroToCents(draft.minOrderValueEuro),
          sortOrder: draft.sortOrder,
        },
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setMsg(null);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; draft: SupplierDraft }) =>
      callUpdate({
        data: {
          supplierId: input.id,
          name: input.draft.name,
          email: input.draft.email,
          phone: input.draft.phone,
          address: input.draft.address,
          customerNumber: input.draft.customerNumber,
          contactPerson: input.draft.contactPerson,
          notes: input.draft.notes,
          deliveryDays: input.draft.deliveryDays.length ? input.draft.deliveryDays : null,
          orderDeadline: input.draft.orderDeadline,
          minOrderValueCents: parseEuroToCents(input.draft.minOrderValueEuro),
          sortOrder: input.draft.sortOrder,
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      setMsg(null);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      callToggle({ data: { supplierId: input.id, isActive: input.isActive } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Inaktive zeigen
        </label>
        <button
          onClick={() => {
            setCreateOpen((v) => !v);
            setMsg(null);
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {createOpen ? "Abbrechen" : "Neuer Lieferant"}
        </button>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {createOpen && (
        <SupplierForm
          initial={EMPTY_DRAFT}
          submitLabel="Anlegen"
          submitting={createMut.isPending}
          onSubmit={(d) => createMut.mutate(d)}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {q.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
      {q.data && q.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine Lieferanten.</p>
      )}

      {q.data && q.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Liefertage</th>
                <th className="px-3 py-2">Bestellschluss</th>
                <th className="px-3 py-2">MBW</th>
                <th className="px-3 py-2">Aktiv</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {q.data.flatMap((s) => {
                const row = (
                  <tr key={s.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {(s.delivery_days ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtTime(s.order_deadline)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fmtEuro(s.min_order_value_cents)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleMut.mutate({ id: s.id, isActive: !s.is_active })}
                        className={
                          s.is_active
                            ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        }
                      >
                        {s.is_active ? "aktiv" : "inaktiv"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                        className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                      >
                        {editingId === s.id ? "Schließen" : "Bearbeiten"}
                      </button>
                    </td>
                  </tr>
                );
                if (editingId !== s.id) return [row];
                return [
                  row,
                  <tr key={s.id + "-edit"} className="border-t border-border bg-muted/20">
                    <td colSpan={7} className="px-3 py-4">
                      <SupplierForm
                        initial={{
                          name: s.name,
                          email: s.email ?? "",
                          phone: s.phone ?? "",
                          address: s.address ?? "",
                          customerNumber: s.customer_number ?? "",
                          contactPerson: s.contact_person ?? "",
                          notes: s.notes ?? "",
                          deliveryDays: s.delivery_days ?? [],
                          orderDeadline: s.order_deadline ? s.order_deadline.slice(0, 5) : "",
                          minOrderValueEuro:
                            s.min_order_value_cents != null
                              ? (s.min_order_value_cents / 100).toFixed(2).replace(".", ",")
                              : "",
                          sortOrder: s.sort_order ?? 0,
                        }}
                        submitLabel="Speichern"
                        submitting={updateMut.isPending}
                        onSubmit={(d) => updateMut.mutate({ id: s.id, draft: d })}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SupplierForm(props: {
  initial: SupplierDraft;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (d: SupplierDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<SupplierDraft>(props.initial);
  const set = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      className="space-y-3 rounded-md border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(d);
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Name *">
          <input
            required
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="E-Mail (Bestell-Empfänger)">
          <input
            type="email"
            value={d.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Telefon">
          <input
            value={d.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Ansprechpartner">
          <input
            value={d.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Adresse">
          <input
            value={d.address}
            onChange={(e) => set("address", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Unsere Kundennummer">
          <input
            value={d.customerNumber}
            onChange={(e) => set("customerNumber", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Bestellschluss (HH:MM)">
          <input
            type="time"
            value={d.orderDeadline}
            onChange={(e) => set("orderDeadline", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Mindestbestellwert (€)">
          <input
            inputMode="decimal"
            placeholder="z. B. 50,00"
            value={d.minOrderValueEuro}
            onChange={(e) => set("minOrderValueEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Sortierung">
          <input
            type="number"
            min={0}
            value={d.sortOrder}
            onChange={(e) => set("sortOrder", parseInt(e.target.value, 10) || 0)}
            className={inputCls}
          />
        </Field>
        <Field label="Liefertage">
          <div className="flex flex-wrap gap-1">
            {DAYS.map((day) => {
              const on = d.deliveryDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    set(
                      "deliveryDays",
                      on ? d.deliveryDays.filter((x) => x !== day) : [...d.deliveryDays, day],
                    )
                  }
                  className={
                    on
                      ? "rounded border border-primary bg-primary px-2 py-1 text-xs text-primary-foreground"
                      : "rounded border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                  }
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
      <Field label="Notizen">
        <textarea
          value={d.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          className={inputCls}
        />
      </Field>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={props.submitting || !d.name.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {props.submitLabel}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
