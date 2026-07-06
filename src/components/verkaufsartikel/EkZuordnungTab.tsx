// EKZ1 — Arbeits-Werkbank für die Einkaufspreis-Zuordnung eines
// Verkaufsartikels. Admin-only (Sicherung liegt server-seitig; die Route
// blendet den Tab zusätzlich für Nicht-Admins aus).
//
// Reine Präsentations- + Query-Schicht. Rechnen macht `computeEkFromLink`
// (getestetes pures Modul); Persistenz + Rollen-Gate + Audit laufen in
// den Server-Fns unter `src/lib/bestellung/ek-linking.functions.ts`.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtCents } from "@/lib/format";
import type { SalesArticle } from "@/lib/bestellung/sales-articles.functions";
import { listSalesArticles } from "@/lib/bestellung/sales-articles.functions";
import {
  linkSalesArticleEk,
  recalcAllLinkedEk,
  searchPurchaseArticlesForEk,
  setEkMatchIgnored,
  unlinkSalesArticleEk,
  type PurchaseArticleHit,
} from "@/lib/bestellung/ek-linking.functions";
import {
  computeEkFromLink,
  parsePortionMlFromName,
  parseVolumeMlFromName,
  wareneinsatzQuote,
  WE_GRUEN_BIS,
  WE_GELB_BIS,
} from "@/lib/bestellung/ek-linking";

type StatusFilter = "offen" | "verknuepft" | "manuell" | "ignoriert" | "alle";
type Group = "getraenke" | "alle";
type WeSort = "none" | "asc" | "desc";

const WE_TOOLTIP =
  "Wareneinsatz = EK netto ÷ VK netto (VK ÷ 1,19). Grün ≤ 25 % · Gelb ≤ 35 % · Rot > 35 %";

function WeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    pct <= WE_GRUEN_BIS
      ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800"
      : pct <= WE_GELB_BIS
        ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800"
        : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs ${cls}`}
      title={WE_TOOLTIP}
    >
      {pct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
    </span>
  );
}

const PORTION_CHIPS: { label: string; ml: number | "flasche" }[] = [
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

function statusOf(a: SalesArticle): StatusFilter {
  if (a.ekMatchIgnored) return "ignoriert";
  if (a.ekSourceArticleId) return "verknuepft";
  if (a.recipeId) return "verknuepft";
  if (a.ekPriceCents !== null) return "manuell";
  return "offen";
}

function isGetraenkeHauptgruppe(a: SalesArticle): boolean {
  const hg = (a.hauptgruppe ?? "").toLowerCase();
  return hg.includes("getränk") || hg.includes("getraenk");
}

export function EkZuordnungTab({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const callList = useServerFn(listSalesArticles);
  const callLink = useServerFn(linkSalesArticleEk);
  const callUnlink = useServerFn(unlinkSalesArticleEk);
  const callIgnore = useServerFn(setEkMatchIgnored);
  const callRecalc = useServerFn(recalcAllLinkedEk);

  const articlesQ = useQuery({
    queryKey: ["sales-articles", locationId],
    queryFn: () => callList({ data: { locationId } }),
    enabled: !!locationId,
  });
  const rows = useMemo(() => articlesQ.data ?? [], [articlesQ.data]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-articles", locationId] });

  const [status, setStatus] = useState<StatusFilter>("offen");
  const [group, setGroup] = useState<Group>("getraenke");
  const [search, setSearch] = useState("");
  const [weSort, setWeSort] = useState<WeSort>("none");
  const [linkTarget, setLinkTarget] = useState<SalesArticle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ salesArticleId: string; reason: string }[]>([]);

  const counts = useMemo(() => {
    const c = { offen: 0, verknuepft: 0, manuell: 0, ignoriert: 0, alle: rows.length };
    for (const r of rows) c[statusOf(r)] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (group === "getraenke" && !isGetraenkeHauptgruppe(r)) return false;
      if (status !== "alle" && statusOf(r) !== status) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (weSort === "none") return base;
    const withPct = base.map((r) => ({
      r,
      pct: wareneinsatzQuote(r.ekPriceCents, r.priceCents),
    }));
    withPct.sort((a, b) => {
      // nicht berechenbare ans Ende
      if (a.pct === null && b.pct === null) return 0;
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return weSort === "asc" ? a.pct - b.pct : b.pct - a.pct;
    });
    return withPct.map((x) => x.r);
  }, [rows, group, status, search, weSort]);

  const avgWe = useMemo(() => {
    const vals: number[] = [];
    for (const r of filtered) {
      const p = wareneinsatzQuote(r.ekPriceCents, r.priceCents);
      if (p !== null) vals.push(p);
    }
    if (vals.length === 0) return null;
    const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
    return { avg: Math.round(avg * 10) / 10, n: vals.length };
  }, [filtered]);

  const recalcMut = useMutation({
    mutationFn: () => callRecalc(),
    onSuccess: (res) => {
      invalidate();
      toast.success(`EKs neu berechnet: ${res.checked} geprüft, ${res.changed} geändert.`);
      setSkipped(res.skipped ?? []);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ignoreMut = useMutation({
    mutationFn: (vars: { salesArticleId: string; ignored: boolean }) => callIgnore({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => setError(e.message),
  });

  const unlinkMut = useMutation({
    mutationFn: (vars: { salesArticleId: string; clearEk: boolean }) => callUnlink({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">EK-Zuordnung</h2>
          <p className="text-sm text-muted-foreground">
            Verkaufsartikel mit dem passenden Einkaufsartikel + Portion/Gebinde verknüpfen. Der EK
            „lebt" damit: bei Preisänderung neu rechnen mit „EKs neu berechnen".
          </p>
        </div>
        <Button variant="outline" onClick={() => recalcMut.mutate()} disabled={recalcMut.isPending}>
          {recalcMut.isPending ? "Rechnet …" : "EKs neu berechnen"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["offen", `Offen (${counts.offen})`],
            ["verknuepft", `Verknüpft (${counts.verknuepft})`],
            ["manuell", `Manueller EK (${counts.manuell})`],
            ["ignoriert", `Ignoriert (${counts.ignoriert})`],
            ["alle", `Alle (${counts.alle})`],
          ] as [StatusFilter, string][]
        ).map(([v, label]) => (
          <Button
            key={v}
            size="sm"
            variant={status === v ? "default" : "outline"}
            onClick={() => setStatus(v)}
          >
            {label}
          </Button>
        ))}
        <div className="ml-2 flex items-center gap-2">
          <Button
            size="sm"
            variant={group === "getraenke" ? "default" : "outline"}
            onClick={() => setGroup("getraenke")}
          >
            Nur Getränke
          </Button>
          <Button
            size="sm"
            variant={group === "alle" ? "default" : "outline"}
            onClick={() => setGroup("alle")}
          >
            Alle Hauptgruppen
          </Button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Name …"
          className="ml-auto w-64"
        />
      </div>

      {avgWe && (
        <div
          className="text-sm text-muted-foreground"
          title="Ungewichteter Schnitt der angezeigten Artikel. Die echte betriebliche Quote braucht Absatzmengen (POS-Statistik) — spätere Welle."
        >
          Ø WE:{" "}
          <span className="font-mono text-foreground">
            {avgWe.avg.toLocaleString("de-DE", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{" "}
            %
          </span>{" "}
          (n={avgWe.n})
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {skipped.length > 0 && (
        <Alert>
          <AlertTitle>
            {skipped.length} Rezept-EK übersprungen — bitte nachpflegen
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {skipped.slice(0, 20).map((s) => {
                const name = rows.find((r) => r.id === s.salesArticleId)?.name ?? s.salesArticleId;
                return (
                  <li key={s.salesArticleId}>
                    <span className="font-medium">{name}</span>: {s.reason}
                  </li>
                );
              })}
              {skipped.length > 20 && <li>… und {skipped.length - 20} weitere.</li>}
            </ul>
            <button
              type="button"
              className="mt-2 text-xs underline"
              onClick={() => setSkipped([])}
            >
              Schliessen
            </button>
          </AlertDescription>
        </Alert>
      )}

      {articlesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Artikel in dieser Auswahl.</p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-40">Untergruppe</TableHead>
                <TableHead className="w-24 text-right">VK</TableHead>
                <TableHead className="w-24 text-right">EK</TableHead>
                <TableHead className="w-24 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setWeSort(weSort === "asc" ? "desc" : weSort === "desc" ? "none" : "asc")
                    }
                    className="inline-flex items-center gap-1 hover:underline"
                    title={WE_TOOLTIP}
                  >
                    WE %{weSort === "asc" ? " ▲" : weSort === "desc" ? " ▼" : ""}
                  </button>
                </TableHead>
                <TableHead className="w-40">Herkunft</TableHead>
                <TableHead className="w-56 text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const st = statusOf(r);
                const wePct = wareneinsatzQuote(r.ekPriceCents, r.priceCents);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.untergruppe ?? (r.untergruppeNr !== null ? `#${r.untergruppeNr}` : "—")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.priceCents === null ? "—" : fmtCents(r.priceCents)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.ekPriceCents === null ? "—" : fmtCents(r.ekPriceCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <WeBadge pct={wePct} />
                    </TableCell>
                    <TableCell>
                      {st === "verknuepft" &&
                        (r.recipeId ? (
                          <Badge variant="secondary" title={r.recipeName ?? ""}>
                            Rezept{r.recipeName ? `: ${r.recipeName}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" title={r.ekSourceArticleName ?? ""}>
                            verknüpft
                            {r.ekPortionMl && r.ekSourceVolumeMl
                              ? ` (${r.ekPortionMl}/${r.ekSourceVolumeMl} ml)`
                              : " (1:1)"}
                          </Badge>
                        ))}
                      {st === "manuell" && <Badge variant="outline">manuell</Badge>}
                      {st === "ignoriert" && <Badge variant="outline">ignoriert</Badge>}
                      {st === "offen" && <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setError(null);
                            setLinkTarget(r);
                          }}
                        >
                          Zuordnen
                        </Button>
                        {st === "verknuepft" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              unlinkMut.mutate({ salesArticleId: r.id, clearEk: false })
                            }
                          >
                            Lösen
                          </Button>
                        ) : st === "ignoriert" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              ignoreMut.mutate({ salesArticleId: r.id, ignored: false })
                            }
                          >
                            Nicht mehr ignorieren
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              ignoreMut.mutate({ salesArticleId: r.id, ignored: true })
                            }
                            disabled={r.ekSourceArticleId !== null}
                            title={
                              r.ekSourceArticleId !== null ? "Erst Verknüpfung lösen" : undefined
                            }
                          >
                            Ignorieren
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {linkTarget && (
        <LinkDialog
          sales={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={() => {
            setLinkTarget(null);
            invalidate();
          }}
          onLink={(vars) => callLink({ data: vars })}
        />
      )}
    </div>
  );
}

function LinkDialog({
  sales,
  onClose,
  onLinked,
  onLink,
}: {
  sales: SalesArticle;
  onClose: () => void;
  onLinked: () => void;
  onLink: (vars: {
    salesArticleId: string;
    sourceArticleId: string;
    portionMl?: number | null;
    sourceVolumeMl?: number | null;
  }) => Promise<{ ekCents: number }>;
}) {
  const callSearch = useServerFn(searchPurchaseArticlesForEk);
  const [query, setQuery] = useState("");
  const searchQ = useQuery({
    queryKey: ["ek-purchase-search", query],
    queryFn: () => callSearch({ data: { query } }),
    enabled: query.trim().length >= 2,
  });
  const [picked, setPicked] = useState<PurchaseArticleHit | null>(null);
  const [sourceVolumeMl, setSourceVolumeMl] = useState<number | null>(null);
  const [portionMl, setPortionMl] = useState<number | null>(() =>
    parsePortionMlFromName(sales.name),
  );
  const [oneToOne, setOneToOne] = useState<boolean>(false);
  const [customMl, setCustomMl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pick(hit: PurchaseArticleHit) {
    setPicked(hit);
    const parsed = parseVolumeMlFromName(hit.name);
    setSourceVolumeMl(parsed);
    setOneToOne(false);
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
      await onLink({
        salesArticleId: sales.id,
        sourceArticleId: picked.id,
        portionMl: oneToOne ? null : portionMl,
        sourceVolumeMl: oneToOne ? null : sourceVolumeMl,
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
          <DialogTitle>EK zuordnen: {sales.name}</DialogTitle>
          <DialogDescription>
            Einkaufsartikel + Portion/Gebinde speichern — EK wird daraus berechnet und aktualisiert
            sich bei „EKs neu berechnen" von selbst.
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
