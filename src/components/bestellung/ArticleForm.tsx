// AP1-C — ArticleForm extrahiert aus bestellung.lieferanten.tsx.
// ST1-B — Kategorie/BE/IE als Select (kuratierte Listen). Fremdwerte bleiben
// als „(nicht in Liste)"-Option erhalten, damit Öffnen+Speichern niemals still
// einen Wert ändert. Kategorie hat „— keine —"; Einheiten sind Pflicht.

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

function SelectField(props: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const trimmed = props.value.trim();
  const inList =
    trimmed === "" || props.options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  return (
    <select
      value={trimmed}
      required={props.required}
      onChange={(e) => props.onChange(e.target.value)}
      className={inputCls}
    >
      {props.allowEmpty && <option value="">{props.placeholder ?? "— keine —"}</option>}
      {!inList && trimmed !== "" && <option value={trimmed}>{trimmed} (nicht in Liste)</option>}
      {props.options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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
          <SelectField
            value={d.category}
            options={props.categories}
            onChange={(v) => set("category", v)}
            allowEmpty
          />
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
          <SelectField
            value={d.orderUnit}
            options={props.units}
            onChange={(v) => set("orderUnit", v)}
            required
          />
        </Field>
        <Field label="Inventureinheit">
          <SelectField
            value={d.inventoryUnit}
            options={props.units}
            onChange={(v) => set("inventoryUnit", v)}
            required
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
