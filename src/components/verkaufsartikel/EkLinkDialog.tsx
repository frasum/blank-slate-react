// VA-EK-Inline — Standalone-Dialog für „EK aus Einkaufsartikel + Portion".
//
// Ruft die bestehenden Server-Fns `searchPurchaseArticlesForEk` +
// `linkSalesArticleEk` direkt auf; identisch in Verhalten zum LinkDialog
// im EkZuordnungTab, aber ohne Tab-Bindung, damit die Verkaufsartikel-
// Liste den EK-Weg inline anbieten kann.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtCents } from "@/lib/format";
import type { SalesArticle } from "@/lib/bestellung/sales-articles.functions";
import {
  linkSalesArticleEk,
  searchPurchaseArticlesForEk,
  type PurchaseArticleHit,
} from "@/lib/bestellung/ek-linking.functions";
import {
  computeEkFromLink,
  parsePortionMlFromName,
  parseVolumeMlFromName,
} from "@/lib/bestellung/ek-linking";

const PORTION_CHIPS: { label: string; ml: number | "flasche" }[] = [
  { label: "2 cl", ml: 20 },
  { label: "4 cl", ml: 40 },
  { label: "5 cl", ml: 50 },
  { label: "0,1 l", ml: 100 },
  { label: "0,2 l", ml: 200 },
  { label: "0,25 l", ml: 250 },
  { label: "0,3 l", ml: 300 },
  { label: "0,4 l", ml: 400 },
  { label: "0,5 l", ml: 500 },
  { label: "1:1 Flasche", ml: "flasche" },
];

export function EkLinkDialog({
  sales,
  onClose,
  onLinked,
}: {
  sales: SalesArticle;
  onClose: () => void;
  onLinked: () => void;
}) {
  const callSearch = useServerFn(searchPurchaseArticlesForEk);
  const callLink = useServerFn(linkSalesArticleEk);

  const [query, setQuery] = useState("");
  const searchQ = useQuery({
    queryKey: ["ek-purchase-search", query],
    queryFn: () => callSearch({ data: { query } }),
    enabled: query.trim().length >= 2,
  });

  const initialOneToOne =
    sales.ekSourceArticleId !== null &&
    sales.ekPortionMl === null &&
    sales.ekSourceVolumeMl === null;

  const [picked, setPicked] = useState<PurchaseArticleHit | null>(null);
  const [sourceVolumeMl, setSourceVolumeMl] = useState<number | null>(
    sales.ekSourceVolumeMl ?? null,
  );
  const [portionMl, setPortionMl] = useState<number | null>(
    sales.ekPortionMl ?? parsePortionMlFromName(sales.name),
  );
  const [oneToOne, setOneToOne] = useState<boolean>(initialOneToOne);
  const [customMl, setCustomMl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pick(hit: PurchaseArticleHit) {
    setPicked(hit);
    // Bei bereits gesetztem Gebinde (Bearbeiten) nicht überschreiben.
    if (sourceVolumeMl === null) {
      setSourceVolumeMl(parseVolumeMlFromName(hit.name));
    }
    setError(null);
  }

  const preview = useMemo(() => {
    if (!picked || picked.priceCents === null) return null;
    if (oneToOne) {
      return computeEkFromLink({
        sourcePriceCents: picked.priceCents,
        portionMl: null,
        sourceVolumeMl: null,
      });
    }
    if (portionMl === null || sourceVolumeMl === null) return null;
    return computeEkFromLink({
      sourcePriceCents: picked.priceCents,
      portionMl,
      sourceVolumeMl,
    });
  }, [picked, oneToOne, portionMl, sourceVolumeMl]);

  const canSave =
    !!picked &&
    picked.priceCents !== null &&
    (oneToOne || (portionMl !== null && sourceVolumeMl !== null)) &&
    preview?.ok === true;

  async function save() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await callLink({
        data: {
          salesArticleId: sales.id,
          sourceArticleId: picked.id,
          portionMl: oneToOne ? null : portionMl,
          sourceVolumeMl: oneToOne ? null : sourceVolumeMl,
        },
      });
      toast.success(`EK gesetzt: ${preview && preview.ok ? fmtCents(preview.ekCents) : "—"}`);
      onLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler.");
    } finally {
      setSaving(false);
    }
  }

  const vkCents = sales.priceCents ?? null;
  const margeCents =
    preview?.ok && vkCents !== null ? Math.max(0, vkCents - preview.ekCents) : null;
  const margePct =
    preview?.ok && vkCents && vkCents > 0 ? (100 * (vkCents - preview.ekCents)) / vkCents : null;

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>EK aus Einkaufsartikel: {sales.name}</DialogTitle>
          <DialogDescription>
            Einkaufsartikel + Portion/Gebinde wählen — EK wird daraus berechnet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Einkaufsartikel suchen (min. 2 Buchstaben) …"
              autoFocus
            />
            {query.trim().length >= 2 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border">
                {searchQ.isLoading ? (
                  <p className="p-2 text-xs text-muted-foreground">Suche …</p>
                ) : (searchQ.data ?? []).length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">Keine Treffer.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {(searchQ.data ?? []).map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          onClick={() => pick(hit)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted ${picked?.id === hit.id ? "bg-muted/70" : ""}`}
                        >
                          <span>
                            <span className="font-medium">{hit.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {hit.supplierName ?? "—"} · {hit.category ?? "—"}
                            </span>
                          </span>
                          <span className="font-mono text-xs">
                            {hit.priceCents === null ? "—" : fmtCents(hit.priceCents)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {picked && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{picked.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {picked.supplierName ?? "—"} · Gebindepreis:{" "}
                    {picked.priceCents === null ? "—" : fmtCents(picked.priceCents)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-muted-foreground">Gebinde-ml:</label>
                <Input
                  type="number"
                  min={1}
                  className="w-28"
                  value={sourceVolumeMl ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setSourceVolumeMl(Number.isFinite(n) && n > 0 ? Math.round(n) : null);
                  }}
                  disabled={oneToOne}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Portion:</span>
                {PORTION_CHIPS.map((c) => {
                  const active =
                    (c.ml === "flasche" && oneToOne) ||
                    (c.ml !== "flasche" && !oneToOne && portionMl === c.ml);
                  return (
                    <Button
                      key={c.label}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => {
                        if (c.ml === "flasche") {
                          setOneToOne(true);
                          setPortionMl(null);
                        } else {
                          setOneToOne(false);
                          setPortionMl(c.ml);
                        }
                      }}
                    >
                      {c.label}
                    </Button>
                  );
                })}
                <Input
                  type="number"
                  min={1}
                  placeholder="eigene ml"
                  className="w-24"
                  value={customMl}
                  onChange={(e) => {
                    setCustomMl(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) {
                      setOneToOne(false);
                      setPortionMl(Math.round(n));
                    }
                  }}
                />
              </div>

              <div className="rounded bg-muted/50 p-2 text-sm">
                {preview?.ok ? (
                  <>
                    <div>
                      EK = {picked.priceCents !== null ? fmtCents(picked.priceCents) : "—"}
                      {oneToOne
                        ? " (1:1 Flasche)"
                        : ` × ${portionMl} ml / ${sourceVolumeMl} ml`} ={" "}
                      <strong>{fmtCents(preview.ekCents)}</strong>
                    </div>
                    {vkCents !== null && (
                      <div className="text-xs text-muted-foreground">
                        VK {fmtCents(vkCents)} · Marge{" "}
                        {margeCents !== null ? fmtCents(margeCents) : "—"}{" "}
                        {margePct !== null ? `(${margePct.toFixed(0)} %)` : ""}
                      </div>
                    )}
                  </>
                ) : preview && !preview.ok ? (
                  <span className="text-destructive">{preview.error}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Wähle eine Portion für die Vorschau.
                  </span>
                )}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? "Speichert …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
