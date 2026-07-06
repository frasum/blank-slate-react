// Lieferanten-Katalog (Welle 1-E).
// Gruppierte Ansicht: Lieferant als Header, darunter aufklappbar die Artikel
// mit „letzte Bestellung" und Direkt-in-Warenkorb. CRUD für Lieferanten und
// Artikel inline. Manager+ für Schreibrechte; Add-to-Cart auch für staff.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Archive, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatShortDate } from "@/lib/format-date";
import { parseEuroToCents } from "@/lib/format";
import { formatUnitPrice } from "@/lib/bestellung/unit-conversion";
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
  setCartMeta,
} from "@/lib/bestellung/cart.functions";
import { getLastOrderByArticle } from "@/lib/bestellung/orders.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  listSupplierLocations,
  setSupplierLocation,
} from "@/lib/bestellung/supplier-locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";

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
  orderUnit: string;
  inventoryUnit: string;
  orderToInventoryFactor: string;
  minOrderQuantity: string;
  quantityStep: string;
  allowDecimalOrderQuantity: boolean;
  targetStockTotal: string;
  targetStockBar: string;
};

const EMPTY_ARTICLE_DRAFT: ArticleDraft = {
  name: "",
  sku: "",
  description: "",
  category: "",
  unit: "Stk",
  priceEuro: "",
  packagingUnit: "",
  orderUnit: "Stk",
  inventoryUnit: "Stk",
  orderToInventoryFactor: "1",
  minOrderQuantity: "1",
  quantityStep: "1",
  allowDecimalOrderQuantity: false,
  targetStockTotal: "",
  targetStockBar: "",
};

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

function fmtQty(q: number): string {
  return Number.isInteger(q) ? q.toString() : q.toLocaleString("de-DE");
}

function parseNumberDe(value: string): number | null {
  const s = value.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
  const [supplierDialog, setSupplierDialog] = useState<
    { mode: "create" } | { mode: "edit"; supplierId: string; initial: SupplierDraft } | null
  >(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [articleDialog, setArticleDialog] = useState<
    | { mode: "create"; supplierId: string }
    | {
        mode: "edit";
        supplierId: string;
        articleId: string;
        initial: ArticleDraft;
        initialLocationIds: string[];
      }
    | null
  >(null);
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
  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
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
      setSupplierDialog(null);
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
      setSupplierDialog(null);
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
    mutationFn: (input: { supplierId: string; draft: ArticleDraft; locationIds: string[] }) =>
      callCreateArt({
        data: {
          supplierId: input.supplierId,
          name: input.draft.name,
          sku: input.draft.sku,
          description: input.draft.description,
          category: input.draft.category,
          unit: input.draft.orderUnit || input.draft.unit,
          priceCents: parseEuroToCents(input.draft.priceEuro) ?? 0,
          packagingUnit: input.draft.packagingUnit
            ? Math.max(1, Math.round(Number(input.draft.packagingUnit)))
            : null,
          orderUnit: input.draft.orderUnit || undefined,
          inventoryUnit: input.draft.inventoryUnit || undefined,
          orderToInventoryFactor: parseNumberDe(input.draft.orderToInventoryFactor) ?? undefined,
          minOrderQuantity: parseNumberDe(input.draft.minOrderQuantity) ?? undefined,
          quantityStep: parseNumberDe(input.draft.quantityStep) ?? undefined,
          allowDecimalOrderQuantity: input.draft.allowDecimalOrderQuantity,
          targetStockTotal: parseNumberDe(input.draft.targetStockTotal),
          targetStockBar: parseNumberDe(input.draft.targetStockBar),
          locationIds: input.locationIds,
        },
      }),
    onSuccess: () => {
      setArticleDialog(null);
      setMsg(null);
      return refreshArticles();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateArtMut = useMutation({
    mutationFn: (input: {
      articleId: string;
      supplierId: string;
      draft: ArticleDraft;
      locationIds: string[];
    }) =>
      callUpdateArt({
        data: {
          articleId: input.articleId,
          supplierId: input.supplierId,
          name: input.draft.name,
          sku: input.draft.sku,
          description: input.draft.description,
          category: input.draft.category,
          unit: input.draft.orderUnit || input.draft.unit,
          priceCents: parseEuroToCents(input.draft.priceEuro) ?? 0,
          packagingUnit: input.draft.packagingUnit
            ? Math.max(1, Math.round(Number(input.draft.packagingUnit)))
            : null,
          orderUnit: input.draft.orderUnit || undefined,
          inventoryUnit: input.draft.inventoryUnit || undefined,
          orderToInventoryFactor: parseNumberDe(input.draft.orderToInventoryFactor) ?? undefined,
          minOrderQuantity: parseNumberDe(input.draft.minOrderQuantity) ?? undefined,
          quantityStep: parseNumberDe(input.draft.quantityStep) ?? undefined,
          allowDecimalOrderQuantity: input.draft.allowDecimalOrderQuantity,
          targetStockTotal: parseNumberDe(input.draft.targetStockTotal),
          targetStockBar: parseNumberDe(input.draft.targetStockBar),
          locationIds: input.locationIds,
        },
      }),
    onSuccess: () => {
      setArticleDialog(null);
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
              setSupplierDialog({ mode: "create" });
              setMsg(null);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Neuer Lieferant
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

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
                    onClick={() => {
                      setArticleDialog({ mode: "create", supplierId: s.id });
                      setMsg(null);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                    title="Neuen Artikel anlegen"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Artikel
                  </button>
                  <span
                    className={
                      s.is_active
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {s.is_active ? "aktiv" : "inaktiv"}
                  </span>
                  <button
                    onClick={() => {
                      setSupplierDialog({
                        mode: "edit",
                        supplierId: s.id,
                        initial: {
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
                        },
                      });
                      setMsg(null);
                    }}
                    className="rounded border border-input bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleSupMut.mutate({ id: s.id, isActive: !s.is_active })}
                    className="rounded border border-input bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={s.is_active ? "Deaktivieren" : "Aktivieren"}
                  >
                    {s.is_active ? (
                      <Archive className="h-3.5 w-3.5" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

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
                          <th className="px-3 py-2">Preis / Einheiten</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {arts.map((a) => {
                          const cart = cartByArticle.get(a.id);
                          const last = lastOrderQ.data?.[a.id];
                          return (
                            <tr key={a.id} className="border-t border-border align-top">
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
                                    Zuletzt {formatShortDate(last.date)} · {fmtQty(last.quantity)}{" "}
                                    {last.unit ?? a.unit}
                                    {last.orderedBy ? ` · ${last.orderedBy}` : ""}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {a.description ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {formatUnitPrice(
                                  a.price_cents ?? 0,
                                  a.order_unit ?? a.unit,
                                  Number(a.order_to_inventory_factor ?? 1) || 1,
                                  a.inventory_unit ?? a.unit,
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() =>
                                      setArticleDialog({
                                        mode: "edit",
                                        supplierId: s.id,
                                        articleId: a.id,
                                        initial: {
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
                                          orderUnit: a.order_unit ?? a.unit ?? "Stk",
                                          inventoryUnit: a.inventory_unit ?? a.unit ?? "Stk",
                                          orderToInventoryFactor: String(
                                            a.order_to_inventory_factor ?? 1,
                                          ).replace(".", ","),
                                          minOrderQuantity: String(
                                            a.min_order_quantity ?? 1,
                                          ).replace(".", ","),
                                          quantityStep: String(a.quantity_step ?? 1).replace(
                                            ".",
                                            ",",
                                          ),
                                          allowDecimalOrderQuantity:
                                            !!a.allow_decimal_order_quantity,
                                          targetStockTotal:
                                            a.target_stock_total != null
                                              ? String(a.target_stock_total).replace(".", ",")
                                              : "",
                                          targetStockBar:
                                            a.target_stock_bar != null
                                              ? String(a.target_stock_bar).replace(".", ",")
                                              : "",
                                        },
                                        initialLocationIds:
                                          a.locationIds ?? (locationsQ.data ?? []).map((l) => l.id),
                                      })
                                    }
                                    className="rounded border border-input bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    title="Bearbeiten"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      toggleArtMut.mutate({ id: a.id, isActive: !a.is_active })
                                    }
                                    className="rounded border border-input bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    title={a.is_active ? "Deaktivieren" : "Aktivieren"}
                                  >
                                    {a.is_active ? (
                                      <Archive className="h-3.5 w-3.5" />
                                    ) : (
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Dialog
        open={!!articleDialog}
        onOpenChange={(open) => {
          if (!open) setArticleDialog(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {articleDialog?.mode === "edit" ? "Artikel bearbeiten" : "Neuer Artikel"}
            </DialogTitle>
          </DialogHeader>
          {articleDialog && (
            <ArticleForm
              initial={articleDialog.mode === "edit" ? articleDialog.initial : EMPTY_ARTICLE_DRAFT}
              suppliers={(suppliersQ.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
              initialSupplierId={articleDialog.supplierId}
              locations={(locationsQ.data ?? []).map((l) => ({ id: l.id, name: l.name }))}
              initialLocationIds={
                articleDialog.mode === "edit"
                  ? articleDialog.initialLocationIds
                  : (locationsQ.data ?? []).map((l) => l.id)
              }
              submitLabel={articleDialog.mode === "edit" ? "Speichern" : "Anlegen"}
              submitting={
                articleDialog.mode === "edit" ? updateArtMut.isPending : createArtMut.isPending
              }
              onSubmit={(d, supplierId, locationIds) => {
                if (articleDialog.mode === "edit") {
                  updateArtMut.mutate({
                    articleId: articleDialog.articleId,
                    supplierId,
                    draft: d,
                    locationIds,
                  });
                } else {
                  createArtMut.mutate({ supplierId, draft: d, locationIds });
                }
              }}
              onCancel={() => setArticleDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!supplierDialog}
        onOpenChange={(open) => {
          if (!open) setSupplierDialog(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {supplierDialog?.mode === "edit" ? "Lieferant bearbeiten" : "Neuer Lieferant"}
            </DialogTitle>
          </DialogHeader>
          {supplierDialog && (
            <SupplierForm
              initial={
                supplierDialog.mode === "edit" ? supplierDialog.initial : EMPTY_SUPPLIER_DRAFT
              }
              submitLabel={supplierDialog.mode === "edit" ? "Speichern" : "Anlegen"}
              submitting={
                supplierDialog.mode === "edit" ? updateSupMut.isPending : createSupMut.isPending
              }
              onSubmit={(d) => {
                if (supplierDialog.mode === "edit") {
                  updateSupMut.mutate({ id: supplierDialog.supplierId, draft: d });
                } else {
                  createSupMut.mutate(d);
                }
              }}
              onCancel={() => setSupplierDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
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
      className="space-y-3"
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
  suppliers: { id: string; name: string }[];
  initialSupplierId: string;
  locations: { id: string; name: string }[];
  initialLocationIds: string[];
  submitLabel: string;
  submitting: boolean;
  onSubmit: (d: ArticleDraft, supplierId: string, locationIds: string[]) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<ArticleDraft>(props.initial);
  const [supplierId, setSupplierId] = useState(props.initialSupplierId);
  const [locationIds, setLocationIds] = useState<string[]>(props.initialLocationIds);
  const [showTargets, setShowTargets] = useState(
    !!(props.initial.targetStockTotal || props.initial.targetStockBar),
  );
  const set = <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));
  const toggleLocation = (id: string) =>
    setLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const priceCentsPreview = parseEuroToCents(d.priceEuro) ?? 0;
  const factorPreview = parseNumberDe(d.orderToInventoryFactor) ?? 1;
  const livePreview =
    priceCentsPreview > 0 &&
    factorPreview > 0 &&
    factorPreview !== 1 &&
    d.orderUnit !== d.inventoryUnit
      ? formatUnitPrice(
          priceCentsPreview,
          d.orderUnit || "Stk",
          factorPreview,
          d.inventoryUnit || "Stk",
        )
      : null;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(d, supplierId, locationIds);
      }}
    >
      <Field label="Lieferant">
        <select
          className={inputCls}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          {props.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Bestellbar für">
        <div className="flex flex-wrap gap-3">
          {props.locations.map((l) => {
            const on = locationIds.includes(l.id);
            return (
              <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={on} onChange={() => toggleLocation(l.id)} />
                {l.name}
              </label>
            );
          })}
        </div>
        {locationIds.length === 0 && (
          <p className="mt-1 text-xs text-destructive">Mindestens ein Restaurant auswählen.</p>
        )}
      </Field>
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
        <Field label="Preis pro Bestelleinheit (€) *">
          <input
            required
            inputMode="decimal"
            placeholder="z. B. 12,90"
            value={d.priceEuro}
            onChange={(e) => set("priceEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Bestelleinheit *">
          <input
            required
            placeholder="Kiste, Sack, kg …"
            value={d.orderUnit}
            onChange={(e) => set("orderUnit", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Inventureinheit *">
          <input
            required
            placeholder="Flasche, kg, Liter …"
            value={d.inventoryUnit}
            onChange={(e) => set("inventoryUnit", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field
          label={`1 ${d.orderUnit || "Bestelleinheit"} = X ${d.inventoryUnit || "Inventureinheit"}`}
        >
          <input
            inputMode="decimal"
            value={d.orderToInventoryFactor}
            onChange={(e) => set("orderToInventoryFactor", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Mindestbestellmenge">
          <input
            inputMode="decimal"
            value={d.minOrderQuantity}
            onChange={(e) => set("minOrderQuantity", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Bestellschritt">
          <input
            inputMode="decimal"
            value={d.quantityStep}
            onChange={(e) => set("quantityStep", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Dezimalbestellung erlaubt">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={d.allowDecimalOrderQuantity}
              onChange={(e) => set("allowDecimalOrderQuantity", e.target.checked)}
            />
            Ja (E1: nur Vormerkung, Bestellung akzeptiert weiterhin Ganzzahlen)
          </label>
        </Field>
        <Field label="Stk/BE (Legacy)">
          <input
            type="number"
            min={1}
            value={d.packagingUnit}
            onChange={(e) => set("packagingUnit", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      {livePreview && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">
          {livePreview}
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={() => setShowTargets((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showTargets ? "▾" : "▸"} Zielbestände (optional, nur Datenfeld)
        </button>
        {showTargets && (
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={`Zielbestand gesamt (${d.inventoryUnit || "Einheit"})`}>
              <input
                inputMode="decimal"
                value={d.targetStockTotal}
                onChange={(e) => set("targetStockTotal", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={`Zielbestand Bar (${d.inventoryUnit || "Einheit"})`}>
              <input
                inputMode="decimal"
                value={d.targetStockBar}
                onChange={(e) => set("targetStockBar", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        )}
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
          disabled={
            props.submitting ||
            !d.name.trim() ||
            !d.orderUnit.trim() ||
            !d.inventoryUnit.trim() ||
            locationIds.length === 0
          }
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
