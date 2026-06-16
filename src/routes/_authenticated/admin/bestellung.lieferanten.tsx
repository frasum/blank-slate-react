// Lieferanten-Katalog (Welle 1-E).
// Gruppierte Ansicht: Lieferant als Header, darunter aufklappbar die Artikel
// mit „letzte Bestellung" und Direkt-in-Warenkorb. CRUD für Lieferanten und
// Artikel inline. Manager+ für Schreibrechte; Add-to-Cart auch für staff.

import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createSupplier,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
} from "@/lib/bestellung/suppliers.functions";
import {
  createArticle,
  listArticles,
  setArticleActive,
  updateArticle,
} from "@/lib/bestellung/articles.functions";
import {
  addCartItem,
  getActiveCart,
  removeCartItem,
  updateCartItem,
} from "@/lib/bestellung/cart.functions";
import { getLastOrderByArticle } from "@/lib/bestellung/orders.functions";

export const Route = createFileRoute("/_authenticated/admin/bestellung/lieferanten")({
  head: () => ({ meta: [{ title: "Lieferanten · Bestellung" }] }),
  component: LieferantenPage,
});

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

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

const EMPTY_SUPPLIER_DRAFT: SupplierDraft = {
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

type ArticleDraft = {
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  priceEuro: string;
  packagingUnit: string;
};

const EMPTY_ARTICLE_DRAFT: ArticleDraft = {
  name: "",
  sku: "",
  description: "",
  category: "",
  unit: "Stk",
  priceEuro: "",
  packagingUnit: "",
};

function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/\./g, "").replace(",", "."));
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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtQty(q: number): string {
  return Number.isInteger(q) ? q.toString() : q.toLocaleString("de-DE");
}

function LieferantenPage() {
  const qc = useQueryClient();
  const callCreateSup = useServerFn(createSupplier);
  const callUpdateSup = useServerFn(updateSupplier);
  const callToggleSup = useServerFn(setSupplierActive);
  const callCreateArt = useServerFn(createArticle);
  const callUpdateArt = useServerFn(updateArticle);
  const callToggleArt = useServerFn(setArticleActive);
  const callAdd = useServerFn(addCartItem);
  const callUpdateCart = useServerFn(updateCartItem);
  const callRemove = useServerFn(removeCartItem);

  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingArticleFor, setAddingArticleFor] = useState<string | null>(null);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: showInactive }],
    queryFn: () => listSuppliers({ data: { includeInactive: showInactive } }),
  });
  const articlesQ = useQuery({
    queryKey: ["bestellung", "articles", { includeInactive: showInactive, all: true }],
    queryFn: () => listArticles({ data: { includeInactive: showInactive } }),
  });
  const cartQ = useQuery({
    queryKey: ["bestellung", "cart"],
    queryFn: () => getActiveCart(),
  });
  const lastOrderQ = useQuery({
    queryKey: ["bestellung", "last-order-by-article"],
    queryFn: () => getLastOrderByArticle(),
    staleTime: 5 * 60 * 1000,
  });

  const refreshSuppliers = () => qc.invalidateQueries({ queryKey: ["bestellung", "suppliers"] });
  const refreshArticles = () => qc.invalidateQueries({ queryKey: ["bestellung", "articles"] });
  const refreshCart = () => qc.invalidateQueries({ queryKey: ["bestellung", "cart"] });

  // Cart-Map: articleId → { itemId, quantity }
  const cartByArticle = useMemo(() => {
    const m = new Map<string, { itemId: string; quantity: number }>();
    for (const it of cartQ.data?.items ?? []) {
      if (it.article_id) m.set(it.article_id, { itemId: it.id, quantity: it.quantity });
    }
    return m;
  }, [cartQ.data]);

  // Artikel pro Lieferant gruppieren + Suche.
  const articlesBySupplier = useMemo(() => {
    const all = articlesQ.data ?? [];
    const grouped = new Map<string, typeof all>();
    for (const a of all) {
      const arr = grouped.get(a.supplier_id) ?? [];
      arr.push(a);
      grouped.set(a.supplier_id, arr);
    }
    return grouped;
  }, [articlesQ.data]);

  const searchLower = search.trim().toLowerCase();
  const filteredSuppliers = useMemo(() => {
    const all = suppliersQ.data ?? [];
    if (!searchLower) return all;
    return all.filter((s) => {
      if (s.name.toLowerCase().includes(searchLower)) return true;
      const arts = articlesBySupplier.get(s.id) ?? [];
      return arts.some(
        (a) =>
          a.name.toLowerCase().includes(searchLower) ||
          (a.sku ?? "").toLowerCase().includes(searchLower),
      );
    });
  }, [suppliersQ.data, searchLower, articlesBySupplier]);

  // Bei aktiver Suche: alle Treffer-Lieferanten automatisch aufklappen.
  const effectivelyExpanded = useMemo(() => {
    if (!searchLower) return expanded;
    const set = new Set(expanded);
    for (const s of filteredSuppliers) set.add(s.id);
    return set;
  }, [expanded, filteredSuppliers, searchLower]);

  const createSupMut = useMutation({
    mutationFn: (d: SupplierDraft) =>
      callCreateSup({
        data: {
          name: d.name,
          email: d.email,
          phone: d.phone,
          address: d.address,
          customerNumber: d.customerNumber,
          contactPerson: d.contactPerson,
          notes: d.notes,
          deliveryDays: d.deliveryDays.length ? d.deliveryDays : null,
          orderDeadline: d.orderDeadline,
          minOrderValueCents: parseEuroToCents(d.minOrderValueEuro),
          sortOrder: d.sortOrder,
        },
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setMsg(null);
      return refreshSuppliers();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateSupMut = useMutation({
    mutationFn: (input: { id: string; draft: SupplierDraft }) =>
      callUpdateSup({
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
      setEditingSupplierId(null);
      setMsg(null);
      return refreshSuppliers();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const toggleSupMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      callToggleSup({ data: { supplierId: input.id, isActive: input.isActive } }),
    onSuccess: refreshSuppliers,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const createArtMut = useMutation({
    mutationFn: (input: { supplierId: string; draft: ArticleDraft }) =>
      callCreateArt({
        data: {
          supplierId: input.supplierId,
          name: input.draft.name,
          sku: input.draft.sku,
          description: input.draft.description,
          category: input.draft.category,
          unit: input.draft.unit,
          priceCents: parseEuroToCents(input.draft.priceEuro) ?? 0,
          packagingUnit: input.draft.packagingUnit
            ? Math.max(1, Math.round(Number(input.draft.packagingUnit)))
            : null,
        },
      }),
    onSuccess: () => {
      setAddingArticleFor(null);
      setMsg(null);
      return refreshArticles();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateArtMut = useMutation({
    mutationFn: (input: { articleId: string; supplierId: string; draft: ArticleDraft }) =>
      callUpdateArt({
        data: {
          articleId: input.articleId,
          supplierId: input.supplierId,
          name: input.draft.name,
          sku: input.draft.sku,
          description: input.draft.description,
          category: input.draft.category,
          unit: input.draft.unit,
          priceCents: parseEuroToCents(input.draft.priceEuro) ?? 0,
          packagingUnit: input.draft.packagingUnit
            ? Math.max(1, Math.round(Number(input.draft.packagingUnit)))
            : null,
        },
      }),
    onSuccess: () => {
      setEditingArticleId(null);
      setMsg(null);
      return refreshArticles();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const toggleArtMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      callToggleArt({ data: { articleId: input.id, isActive: input.isActive } }),
    onSuccess: refreshArticles,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const addCartMut = useMutation({
    mutationFn: (articleId: string) => callAdd({ data: { articleId, quantity: 1 } }),
    onSuccess: refreshCart,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateCartMut = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) => callUpdateCart({ data: input }),
    onSuccess: refreshCart,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const removeCartMut = useMutation({
    mutationFn: (itemId: string) => callRemove({ data: { itemId } }),
    onSuccess: refreshCart,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Lieferant, Artikel oder SKU …"
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Inaktive zeigen
        </label>
        <div className="ml-auto">
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
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {createOpen && (
        <SupplierForm
          initial={EMPTY_SUPPLIER_DRAFT}
          submitLabel="Anlegen"
          submitting={createSupMut.isPending}
          onSubmit={(d) => createSupMut.mutate(d)}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {suppliersQ.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
      {!suppliersQ.isLoading && filteredSuppliers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {search ? "Keine Treffer." : "Noch keine Lieferanten."}
        </p>
      )}

      <div className="space-y-3">
        {filteredSuppliers.map((s) => {
          const arts = articlesBySupplier.get(s.id) ?? [];
          const isOpen = effectivelyExpanded.has(s.id);
          const isEditing = editingSupplierId === s.id;
          return (
            <div key={s.id} className="overflow-hidden rounded-md border border-border bg-card">
              {/* Header */}
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="flex items-center gap-2 text-left"
                  title={isOpen ? "Einklappen" : "Aufklappen"}
                >
                  <span className="text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {arts.length}
                  </span>
                  <span className="font-medium text-foreground">{s.name}</span>
                </button>
                <span className="text-xs text-muted-foreground">{s.phone ?? s.email ?? ""}</span>
                <span className="text-xs text-muted-foreground">
                  {(s.delivery_days ?? []).join(", ") || "—"} · Bestellschluss{" "}
                  {fmtTime(s.order_deadline)} · MBW {fmtEuro(s.min_order_value_cents)}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => toggleSupMut.mutate({ id: s.id, isActive: !s.is_active })}
                    className={
                      s.is_active
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {s.is_active ? "aktiv" : "inaktiv"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingSupplierId(isEditing ? null : s.id);
                      setMsg(null);
                    }}
                    className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                  >
                    {isEditing ? "Schließen" : "Bearbeiten"}
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-border bg-muted/20 px-3 py-4">
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
                    submitting={updateSupMut.isPending}
                    onSubmit={(d) => updateSupMut.mutate({ id: s.id, draft: d })}
                    onCancel={() => setEditingSupplierId(null)}
                  />
                </div>
              )}

              {isOpen && (
                <div className="border-t border-border">
                  {arts.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Noch keine Artikel.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 w-24">Bestellen</th>
                          <th className="px-3 py-2">Artikel</th>
                          <th className="px-3 py-2">Beschreibung</th>
                          <th className="px-3 py-2">Einheit</th>
                          <th className="px-3 py-2">Stk/BE</th>
                          <th className="px-3 py-2 text-right">Preis</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {arts.map((a) => {
                          const cart = cartByArticle.get(a.id);
                          const last = lastOrderQ.data?.[a.id];
                          const isArtEditing = editingArticleId === a.id;
                          return (
                            <Fragment key={a.id}>
                              <tr className="border-t border-border align-top">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        if (cart) {
                                          updateCartMut.mutate({
                                            itemId: cart.itemId,
                                            quantity: cart.quantity + 1,
                                          });
                                        } else {
                                          addCartMut.mutate(a.id);
                                        }
                                      }}
                                      disabled={addCartMut.isPending}
                                      className="rounded-full bg-primary/10 px-2 py-1 text-primary hover:bg-primary/20"
                                      title="In den Warenkorb"
                                    >
                                      🛒
                                    </button>
                                    {cart && (
                                      <>
                                        <span className="text-xs font-medium text-foreground">
                                          {cart.quantity}
                                        </span>
                                        <button
                                          onClick={() => {
                                            if (cart.quantity <= 1) {
                                              removeCartMut.mutate(cart.itemId);
                                            } else {
                                              updateCartMut.mutate({
                                                itemId: cart.itemId,
                                                quantity: cart.quantity - 1,
                                              });
                                            }
                                          }}
                                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                                          title="Menge verringern"
                                        >
                                          −
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-foreground">
                                    {a.name}
                                    {a.sku ? (
                                      <span className="ml-1 text-xs text-muted-foreground">
                                        [{a.sku}]
                                      </span>
                                    ) : null}
                                  </div>
                                  {last ? (
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      Zuletzt {fmtDate(last.date)} · {fmtQty(last.quantity)}{" "}
                                      {last.unit ?? a.unit}
                                      {last.orderedBy ? ` · ${last.orderedBy}` : ""}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {a.description ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{a.unit}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {a.packaging_unit ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-right text-foreground">
                                  {fmtEuro(a.price_cents)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() =>
                                        setEditingArticleId(isArtEditing ? null : a.id)
                                      }
                                      className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                                    >
                                      {isArtEditing ? "Schließen" : "Bearbeiten"}
                                    </button>
                                    <button
                                      onClick={() =>
                                        toggleArtMut.mutate({ id: a.id, isActive: !a.is_active })
                                      }
                                      className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                                      title={a.is_active ? "Deaktivieren" : "Aktivieren"}
                                    >
                                      {a.is_active ? "🗑" : "↺"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isArtEditing && (
                                <tr className="border-t border-border bg-muted/20">
                                  <td colSpan={7} className="px-3 py-4">
                                    <ArticleForm
                                      initial={{
                                        name: a.name,
                                        sku: a.sku ?? "",
                                        description: a.description ?? "",
                                        category: a.category ?? "",
                                        unit: a.unit,
                                        priceEuro:
                                          a.price_cents != null
                                            ? (a.price_cents / 100).toFixed(2).replace(".", ",")
                                            : "",
                                        packagingUnit: a.packaging_unit?.toString() ?? "",
                                      }}
                                      submitLabel="Speichern"
                                      submitting={updateArtMut.isPending}
                                      onSubmit={(d) =>
                                        updateArtMut.mutate({
                                          articleId: a.id,
                                          supplierId: s.id,
                                          draft: d,
                                        })
                                      }
                                      onCancel={() => setEditingArticleId(null)}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <div className="border-t border-border bg-muted/10 px-3 py-2">
                    {addingArticleFor === s.id ? (
                      <ArticleForm
                        initial={EMPTY_ARTICLE_DRAFT}
                        submitLabel="Anlegen"
                        submitting={createArtMut.isPending}
                        onSubmit={(d) => createArtMut.mutate({ supplierId: s.id, draft: d })}
                        onCancel={() => setAddingArticleFor(null)}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setAddingArticleFor(s.id);
                          setMsg(null);
                        }}
                        className="text-sm text-primary hover:underline"
                      >
                        + Neuer Artikel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

function ArticleForm(props: {
  initial: ArticleDraft;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (d: ArticleDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ArticleDraft>(props.initial);
  const set = <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(d);
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Name *">
          <input
            required
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="SKU">
          <input value={d.sku} onChange={(e) => set("sku", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Kategorie">
          <input
            value={d.category}
            onChange={(e) => set("category", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Einheit *">
          <input
            required
            value={d.unit}
            onChange={(e) => set("unit", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Preis (€)">
          <input
            inputMode="decimal"
            placeholder="z. B. 12,90"
            value={d.priceEuro}
            onChange={(e) => set("priceEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Stk/BE">
          <input
            type="number"
            min={1}
            value={d.packagingUnit}
            onChange={(e) => set("packagingUnit", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Beschreibung">
        <textarea
          value={d.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className={inputCls}
        />
      </Field>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={props.submitting || !d.name.trim() || !d.unit.trim()}
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
