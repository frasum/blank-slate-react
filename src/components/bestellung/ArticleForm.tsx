// AP1-C — ArticleForm extrahiert aus bestellung.lieferanten.tsx.
// Reine Verschiebung — Verhalten, Felder, Validierung, Preview unverändert.
// `Field` und `inputCls` werden mit-exportiert (SupplierForm nutzt sie weiter).

import { useState } from "react";
import { parseEuroToCents } from "@/lib/format";
import { parseNumberDe } from "@/lib/bestellung/parse-de";
import { formatUnitPrice } from "@/lib/bestellung/unit-conversion";
import { type ArticleDraft } from "@/lib/bestellung/article-draft";

export const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ArticleForm(props: {
  initial: ArticleDraft;
  suppliers: { id: string; name: string }[];
  initialSupplierId: string;
  locations: { id: string; name: string }[];
  initialLocationIds: string[];
  categories: string[];
  units: string[];
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
        <Field label="Name">
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
            list="ak1-article-categories"
            autoComplete="off"
            value={d.category}
            onChange={(e) => set("category", e.target.value)}
            className={inputCls}
          />
          <datalist id="ak1-article-categories">
            {props.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="€ pro Bestelleinheit">
          <input
            required
            inputMode="decimal"
            placeholder="z. B. 12,90"
            value={d.priceEuro}
            onChange={(e) => set("priceEuro", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Bestelleinheit">
          <input
            required
            list="ak2-article-units"
            autoComplete="off"
            placeholder="Kiste, Sack, kg …"
            value={d.orderUnit}
            onChange={(e) => set("orderUnit", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Inventureinheit">
          <input
            required
            list="ak2-article-units"
            autoComplete="off"
            placeholder="Flasche, kg, Liter …"
            value={d.inventoryUnit}
            onChange={(e) => set("inventoryUnit", e.target.value)}
            className={inputCls}
          />
          <datalist id="ak2-article-units">
            {props.units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
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