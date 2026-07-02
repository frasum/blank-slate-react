// Wein-Katalog (Welle 3-A). Eigene Sicht auf Artikel mit category = 'Wein'.
// Nutzt dieselben Server-Mutations wie der Artikel-Tab, nur mit gesetzter
// Kategorie und den Wein-Zusatzfeldern.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createArticle,
  listArticles,
  setArticleActive,
  updateArticle,
} from "@/lib/bestellung/articles.functions";
import { listSuppliers } from "@/lib/bestellung/suppliers.functions";
import { parseEuroToCents } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/bestellung/wein")({
  head: () => ({ meta: [{ title: "Wein · Bestellung" }] }),
  component: WeinPage,
});

const SPECIAL_ATTRS = ["Bio", "Vegan", "Biodynamisch", "Demeter", "Alte Reben"] as const;

type WineDraft = {
  id?: string;
  supplierId: string;
  name: string;
  priceEuro: string;
  unit: string;
  description: string;
  grapeVariety: string;
  originCountry: string;
  foodPairings: string;
  specialAttributes: string[];
  imageUrl: string;
};

function emptyDraft(supplierId = ""): WineDraft {
  return {
    supplierId,
    name: "",
    priceEuro: "",
    unit: "Fl",
    description: "",
    grapeVariety: "",
    originCountry: "",
    foodPairings: "",
    specialAttributes: [],
    imageUrl: "",
  };
}

function fmtEuro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (
    (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

function WeinPage() {
  const qc = useQueryClient();
  const callCreate = useServerFn(createArticle);
  const callUpdate = useServerFn(updateArticle);
  const callToggle = useServerFn(setArticleActive);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const suppliersQ = useQuery({
    queryKey: ["bestellung", "suppliers", { includeInactive: true }],
    queryFn: () => listSuppliers({ data: { includeInactive: true } }),
  });

  const winesQ = useQuery({
    queryKey: ["bestellung", "wines", { search, includeInactive: showInactive }],
    queryFn: () =>
      listArticles({
        data: {
          onlyWine: true,
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
    qc.invalidateQueries({ queryKey: ["bestellung", "wines"] });
    qc.invalidateQueries({ queryKey: ["bestellung", "articles"] });
  };

  const buildPayload = (d: WineDraft) => {
    const cents = parseEuroToCents(d.priceEuro);
    if (cents == null) throw new Error("Preis ungültig.");
    if (!d.supplierId) throw new Error("Lieferant wählen.");
    if (!d.name.trim()) throw new Error("Name fehlt.");
    return {
      supplierId: d.supplierId,
      name: d.name,
      sku: "",
      description: d.description,
      category: "Wein",
      unit: d.unit || "Fl",
      priceCents: cents,
      packagingUnit: null,
      imageUrl: d.imageUrl,
      sortOrder: 0,
      grapeVariety: d.grapeVariety,
      originCountry: d.originCountry,
      foodPairings: d.foodPairings,
      specialAttributes: d.specialAttributes.length > 0 ? d.specialAttributes : null,
    };
  };

  const createMut = useMutation({
    mutationFn: (d: WineDraft) => callCreate({ data: buildPayload(d) }),
    onSuccess: () => {
      setCreateOpen(false);
      setMsg(null);
      refresh();
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; draft: WineDraft }) =>
      callUpdate({ data: { ...buildPayload(input.draft), articleId: input.id } }),
    onSuccess: () => {
      setEditingId(null);
      setMsg(null);
      refresh();
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      callToggle({ data: { articleId: input.id, isActive: input.isActive } }),
    onSuccess: refresh,
    onError: (e) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const filtered = useMemo(() => {
    const list = winesQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => {
      return (
        w.name.toLowerCase().includes(q) ||
        (w.grape_variety ?? "").toLowerCase().includes(q) ||
        (w.origin_country ?? "").toLowerCase().includes(q)
      );
    });
  }, [winesQ.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[200px] text-xs">
          <span className="block uppercase tracking-wide text-muted-foreground">
            Suche (Name, Rebsorte, Herkunft)
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} />
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
          {createOpen ? "Abbrechen" : "Neuer Wein"}
        </button>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {createOpen && (
        <WineForm
          initial={emptyDraft()}
          suppliers={suppliersQ.data ?? []}
          submitLabel="Anlegen"
          submitting={createMut.isPending}
          onSubmit={(d) => createMut.mutate(d)}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {winesQ.isLoading && <p className="text-sm text-muted-foreground">Lädt …</p>}
      {filtered.length === 0 && !winesQ.isLoading && (
        <p className="text-sm text-muted-foreground">
          Noch keine Weine angelegt. Erstelle einen Wein mit Kategorie „Wein".
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((w) => (
          <div key={w.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground">{w.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {suppliersById.get(w.supplier_id) ?? "—"}
                </p>
              </div>
              <div className="text-right font-mono text-sm">{fmtEuro(w.price_cents)}</div>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {w.grape_variety && <Row label="Rebsorte" value={w.grape_variety} />}
              {w.origin_country && <Row label="Herkunft" value={w.origin_country} />}
              {w.food_pairings && <Row label="Passt zu" value={w.food_pairings} />}
            </dl>
            {Array.isArray(w.special_attributes) && w.special_attributes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {w.special_attributes.map((a) => (
                  <span key={a} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {a}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={() => toggleMut.mutate({ id: w.id, isActive: !w.is_active })}
                className={
                  w.is_active
                    ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {w.is_active ? "aktiv" : "inaktiv"}
              </button>
              <button
                onClick={() => setEditingId(editingId === w.id ? null : w.id)}
                className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                {editingId === w.id ? "Schließen" : "Bearbeiten"}
              </button>
            </div>
            {editingId === w.id && (
              <div className="mt-3">
                <WineForm
                  initial={{
                    supplierId: w.supplier_id,
                    name: w.name,
                    priceEuro: (w.price_cents / 100).toFixed(2).replace(".", ","),
                    unit: w.unit ?? "Fl",
                    description: w.description ?? "",
                    grapeVariety: w.grape_variety ?? "",
                    originCountry: w.origin_country ?? "",
                    foodPairings: w.food_pairings ?? "",
                    specialAttributes: Array.isArray(w.special_attributes)
                      ? w.special_attributes
                      : [],
                    imageUrl: w.image_url ?? "",
                  }}
                  suppliers={suppliersQ.data ?? []}
                  submitLabel="Speichern"
                  submitting={updateMut.isPending}
                  onSubmit={(d) => updateMut.mutate({ id: w.id, draft: d })}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function WineForm(props: {
  initial: WineDraft;
  suppliers: Array<{ id: string; name: string }>;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (d: WineDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<WineDraft>(props.initial);
  const set = <K extends keyof WineDraft>(k: K, v: WineDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const toggleAttr = (attr: string) => {
    setD((p) => ({
      ...p,
      specialAttributes: p.specialAttributes.includes(attr)
        ? p.specialAttributes.filter((x) => x !== attr)
        : [...p.specialAttributes, attr],
    }));
  };

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
        <Field label="Preis (€) *">
          <input
            required
            inputMode="decimal"
            placeholder="z. B. 14,90"
            value={d.priceEuro}
            onChange={(e) => set("priceEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Einheit">
          <input
            value={d.unit}
            onChange={(e) => set("unit", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-md border border-dashed border-border p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
          Wein-Details
        </legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Rebsorte">
            <input
              value={d.grapeVariety}
              onChange={(e) => set("grapeVariety", e.target.value)}
              placeholder="z. B. Riesling"
              className={inputCls}
            />
          </Field>
          <Field label="Herkunftsland">
            <input
              value={d.originCountry}
              onChange={(e) => set("originCountry", e.target.value)}
              placeholder="z. B. Deutschland"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Speisenempfehlungen">
          <textarea
            rows={2}
            value={d.foodPairings}
            onChange={(e) => set("foodPairings", e.target.value)}
            placeholder="z. B. Fisch, Geflügel, Käse"
            className={inputCls}
          />
        </Field>
        <div>
          <span className="block text-xs uppercase tracking-wide text-muted-foreground">
            Besondere Merkmale
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {SPECIAL_ATTRS.map((a) => {
              const active = d.specialAttributes.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAttr(a)}
                  className={
                    active
                      ? "rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                      : "rounded-full border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
                  }
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <Field label="Beschreibung">
        <textarea
          rows={2}
          value={d.description}
          onChange={(e) => set("description", e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={props.submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {props.submitting ? "…" : props.submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="block uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const selectCls = inputCls;
