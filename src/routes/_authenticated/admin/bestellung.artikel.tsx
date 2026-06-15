// Artikel-Katalog (Welle 1-B).
// Filter: Lieferant, Kategorie (frei), Suche (Name/SKU). Manager+ Schreibrechte.
// Preise als Cents, Eingabe in Euro mit Komma.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createArticle,
  listArticleCategories,
  listArticles,
  setArticleActive,
  updateArticle,
} from "@/lib/bestellung/articles.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { listOrderUnits, createOrderUnit } from "@/lib/bestellung/order-units.functions";

export const Route = createFileRoute("/_authenticated/admin/bestellung/artikel")({
  head: () => ({ meta: [{ title: "Artikel · Bestellung" }] }),
  component: ArtikelPage,
});

type ArticleDraft = {
  supplierId: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  orderUnitId: string;
  priceEuro: string;
  packagingUnit: string;
  imageUrl: string;
  sortOrder: number;
};

function emptyDraft(supplierId = ""): ArticleDraft {
  return {
    supplierId,
    name: "",
    sku: "",
    description: "",
    category: "",
    unit: "Stk",
    orderUnitId: "",
    priceEuro: "",
    packagingUnit: "",
    imageUrl: "",
    sortOrder: 0,
  };
}

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
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function ArtikelPage() {
  const qc = useQueryClient();
  const callCreate = useServerFn(createArticle);
  const callUpdate = useServerFn(updateArticle);
  const callToggle = useServerFn(setArticleActive);
  const callCreateUnit = useServerFn(createOrderUnit);

  const [filterSupplier, setFilterSupplier] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: true }],
    queryFn: () => listSuppliers({ data: { includeInactive: true } }),
  });
  const unitsQ = useQuery({
    queryKey: ["bestellung", "order-units"],
    queryFn: () => listOrderUnits(),
  });
  const categoriesQ = useQuery({
    queryKey: ["bestellung", "article-categories"],
    queryFn: () => listArticleCategories(),
  });
  const articlesQ = useQuery({
    queryKey: [
      "bestellung",
      "articles",
      { supplier: filterSupplier, category: filterCategory, search, includeInactive: showInactive },
    ],
    queryFn: () =>
      listArticles({
        data: {
          supplierId: filterSupplier || undefined,
          category: filterCategory || undefined,
          search: search.trim() || undefined,
          includeInactive: showInactive,
        },
      }),
  });

  const suppliersById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersQ.data ?? []) m.set(s.id, s.name);
    return m;
  }, [suppliersQ.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bestellung", "articles"] });
    qc.invalidateQueries({ queryKey: ["bestellung", "article-categories"] });
  };

  const createMut = useMutation({
    mutationFn: (draft: ArticleDraft) => {
      const cents = parseEuroToCents(draft.priceEuro);
      if (cents == null) throw new Error("Preis ungültig.");
      if (!draft.supplierId) throw new Error("Lieferant wählen.");
      return callCreate({
        data: {
          supplierId: draft.supplierId,
          name: draft.name,
          sku: draft.sku,
          description: draft.description,
          category: draft.category,
          unit: draft.unit || "Stk",
          orderUnitId: draft.orderUnitId || null,
          priceCents: cents,
          packagingUnit: draft.packagingUnit ? parseInt(draft.packagingUnit, 10) : null,
          imageUrl: draft.imageUrl,
          sortOrder: draft.sortOrder,
        },
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      setMsg(null);
      refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; draft: ArticleDraft }) => {
      const cents = parseEuroToCents(input.draft.priceEuro);
      if (cents == null) throw new Error("Preis ungültig.");
      return callUpdate({
        data: {
          articleId: input.id,
          supplierId: input.draft.supplierId,
          name: input.draft.name,
          sku: input.draft.sku,
          description: input.draft.description,
          category: input.draft.category,
          unit: input.draft.unit || "Stk",
          orderUnitId: input.draft.orderUnitId || null,
          priceCents: cents,
          packagingUnit: input.draft.packagingUnit
            ? parseInt(input.draft.packagingUnit, 10)
            : null,
          imageUrl: input.draft.imageUrl,
          sortOrder: input.draft.sortOrder,
        },
      });
    },
    onSuccess: () => {
      setEditingId(null);
      setMsg(null);
      refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      callToggle({ data: { articleId: input.id, isActive: input.isActive } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const newUnitMut = useMutation({
    mutationFn: (input: { name: string; abbreviation: string }) =>
      callCreateUnit({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bestellung", "order-units"] }),
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const onNewUnit = () => {
    const name = window.prompt("Name der Einheit (z. B. Kiste)?")?.trim();
    if (!name) return;
    const abbr = window.prompt("Abkürzung (z. B. Kr)?")?.trim();
    if (!abbr) return;
    newUnitMut.mutate({ name, abbreviation: abbr });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">Lieferant</span>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
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
        <label className="block text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">Kategorie</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={selectCls}
          >
            <option value="">Alle</option>
            {(categoriesQ.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 min-w-[200px] text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">Suche</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name oder SKU"
            className={inputCls}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Inaktive
        </label>
        <button
          onClick={() => {
            setCreateOpen((v) => !v);
            setMsg(null);
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {createOpen ? "Abbrechen" : "Neuer Artikel"}
        </button>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {createOpen && (
        <ArticleForm
          initial={emptyDraft(filterSupplier)}
          suppliers={suppliersQ.data ?? []}
          units={unitsQ.data ?? []}
          categories={categoriesQ.data ?? []}
          submitLabel="Anlegen"
          submitting={createMut.isPending}
          onSubmit={(d) => createMut.mutate(d)}
          onCancel={() => setCreateOpen(false)}
          onNewUnit={onNewUnit}
        />
      )}

      {articlesQ.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
      {articlesQ.data && articlesQ.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Artikel gefunden.</p>
      )}

      {articlesQ.data && articlesQ.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Artikel</th>
                <th className="px-3 py-2">Lieferant</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Kategorie</th>
                <th className="px-3 py-2 text-right">Preis</th>
                <th className="px-3 py-2">Einheit</th>
                <th className="px-3 py-2">Aktiv</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {articlesQ.data.flatMap((a) => {
                const row = (
                  <tr key={a.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium text-foreground">{a.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {suppliersById.get(a.supplier_id) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.sku ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtEuro(a.price_cents)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.unit}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleMut.mutate({ id: a.id, isActive: !a.is_active })}
                        className={
                          a.is_active
                            ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        }
                      >
                        {a.is_active ? "aktiv" : "inaktiv"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                        className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                      >
                        {editingId === a.id ? "Schließen" : "Bearbeiten"}
                      </button>
                    </td>
                  </tr>
                );
                if (editingId !== a.id) return [row];
                return [
                  row,
                  <tr key={a.id + "-edit"} className="border-t border-border bg-muted/20">
                    <td colSpan={8} className="px-3 py-4">
                      <ArticleForm
                        initial={{
                          supplierId: a.supplier_id,
                          name: a.name,
                          sku: a.sku ?? "",
                          description: a.description ?? "",
                          category: a.category ?? "",
                          unit: a.unit ?? "Stk",
                          orderUnitId: a.order_unit_id ?? "",
                          priceEuro: (a.price_cents / 100).toFixed(2).replace(".", ","),
                          packagingUnit: a.packaging_unit != null ? String(a.packaging_unit) : "",
                          imageUrl: a.image_url ?? "",
                          sortOrder: a.sort_order ?? 0,
                        }}
                        suppliers={suppliersQ.data ?? []}
                        units={unitsQ.data ?? []}
                        categories={categoriesQ.data ?? []}
                        submitLabel="Speichern"
                        submitting={updateMut.isPending}
                        onSubmit={(d) => updateMut.mutate({ id: a.id, draft: d })}
                        onCancel={() => setEditingId(null)}
                        onNewUnit={onNewUnit}
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

function ArticleForm(props: {
  initial: ArticleDraft;
  suppliers: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string; abbreviation: string }>;
  categories: string[];
  submitLabel: string;
  submitting: boolean;
  onSubmit: (d: ArticleDraft) => void;
  onCancel: () => void;
  onNewUnit: () => void;
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Lieferant *">
          <select
            required
            value={d.supplierId}
            onChange={(e) => set("supplierId", e.target.value)}
            className={selectCls}
          >
            <option value="">— wählen —</option>
            {props.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name *">
          <input
            required
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="SKU / Artikelnummer">
          <input value={d.sku} onChange={(e) => set("sku", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Kategorie">
          <input
            list="article-cats"
            value={d.category}
            onChange={(e) => set("category", e.target.value)}
            className={inputCls}
          />
          <datalist id="article-cats">
            {props.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Preis (€) *">
          <input
            required
            inputMode="decimal"
            placeholder="z. B. 4,99"
            value={d.priceEuro}
            onChange={(e) => set("priceEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Verkaufseinheit">
          <input value={d.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Bestell-Gebinde">
          <div className="flex gap-2">
            <select
              value={d.orderUnitId}
              onChange={(e) => set("orderUnitId", e.target.value)}
              className={selectCls}
            >
              <option value="">—</option>
              {props.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={props.onNewUnit}
              className="rounded-md border border-input bg-background px-3 py-2 text-xs hover:bg-accent"
            >
              + Neu
            </button>
          </div>
        </Field>
        <Field label="Stück pro Gebinde">
          <input
            type="number"
            min={1}
            value={d.packagingUnit}
            onChange={(e) => set("packagingUnit", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Bild-URL">
          <input
            value={d.imageUrl}
            onChange={(e) => set("imageUrl", e.target.value)}
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
          disabled={props.submitting || !d.name.trim() || !d.supplierId}
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
const selectCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}