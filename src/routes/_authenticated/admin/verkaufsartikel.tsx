// VA1 — Verkaufsartikel-Tab im Bestellung-Bereich.
//
// Standort-scoped Liste der POS-Verkaufsartikel mit inline editierbaren
// Preisen (Euro, intern Cents). Preis NULL = POS-Technik ohne Preis
// (Modifikator/Sammel-PLU/Rabatt) und wird als gedämpfter Strich gezeigt.
// Kein Delete — Deaktivieren über Aktiv-Switch.

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createSalesArticle,
  listSalesArticles,
  updateSalesArticle,
  type SalesArticle,
} from "@/lib/bestellung/sales-articles.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EkZuordnungTab } from "@/components/verkaufsartikel/EkZuordnungTab";
import { RezepteTab } from "@/components/verkaufsartikel/RezepteTab";
import { SalesGroupFilter } from "@/components/bestellung/SalesGroupFilter";
import { ALL, matchesHaupt, matchesUnter, matchesWg } from "@/lib/bestellung/sales-group-filter";
import { wareneinsatzQuote, WE_GRUEN_BIS, WE_GELB_BIS } from "@/lib/bestellung/ek-linking";
import { supabase } from "@/integrations/supabase/client";

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

export const Route = createFileRoute("/_authenticated/admin/verkaufsartikel")({
  head: () => ({ meta: [{ title: "Verkaufsartikel · Bestellung" }] }),
  component: VerkaufsartikelPage,
});

type PriceField = "priceCents" | "takeawayPriceCents" | "ekPriceCents";

function VerkaufsartikelPage() {
  const qc = useQueryClient();
  const { identity } = useAuth();
  const isAdmin = identity?.role === "admin";
  const callList = useServerFn(listSalesArticles);
  const callUpdate = useServerFn(updateSalesArticle);
  const callCreate = useServerFn(createSalesArticle);

  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: () => listLocations(),
  });
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0].id);
  }, [locations, locationId]);

  const articlesQ = useQuery({
    queryKey: ["sales-articles", locationId],
    queryFn: () => callList({ data: { locationId } }),
    enabled: !!locationId,
  });
  const rows = useMemo(() => articlesQ.data ?? [], [articlesQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-articles", locationId] });

  const [search, setSearch] = useState("");
  const [haupt, setHaupt] = useState<string>(ALL);
  const [unter, setUnter] = useState<string>(ALL);
  const [wg, setWg] = useState<string>(ALL);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<SalesArticle | null>(null);
  const [subtab, setSubtab] = useState<"liste" | "ek">("liste");
  const [tabValue, setTabValue] = useState<"liste" | "ek" | "rezepte">("liste");
  // R2b — Cross-Tab-Übergabe: wenn gesetzt, öffnet der Rezepte-Tab beim
  // Wechsel den zweistufigen „+ Gericht"-Fluss mit diesem Artikel bereits gewählt.
  const [pendingRecipeForArticleId, setPendingRecipeForArticleId] = useState<string | null>(null);

  function startRecipeForArticle(salesArticleId: string) {
    setPendingRecipeForArticleId(salesArticleId);
    setTabValue("rezepte");
    setSubtab("liste");
  }

  // UX-Gate: Rezepte-Tab nur wenn has_permission('recipes.manage', null) true ist.
  const canManageRecipes = useQuery({
    queryKey: ["has-perm", "recipes.manage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_permission", {
        _perm: "recipes.manage",
      });
      if (error) return false;
      return Boolean(data);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.isActive) return false;
      if (haupt !== ALL && !matchesHaupt(r, haupt)) return false;
      if (unter !== ALL && !matchesUnter(r, unter)) return false;
      if (wg !== ALL && !matchesWg(r, wg)) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, haupt, unter, wg, showInactive]);

  const activeCount = rows.filter((r) => r.isActive).length;

  const updateMut = useMutation({
    mutationFn: (input: Parameters<typeof callUpdate>[0]) => callUpdate(input),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Fehler."),
  });

  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof callCreate>[0]) => callCreate(input),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Verkaufsartikel</h2>
          <p className="text-sm text-muted-foreground">
            POS-Verkaufsartikel je Standort mit Preisen. Basis für spätere Auswertungen gegen
            Vectron-Umsätze.
          </p>
        </div>
        <Button
          disabled={!locationId}
          onClick={() => {
            setError(null);
            setAddOpen(true);
          }}
        >
          Artikel anlegen
        </Button>
      </div>

      <LocationPills locations={locations} value={locationId} onChange={setLocationId} />

      {isAdmin && locationId && (
        <Tabs
          value={tabValue}
          onValueChange={(v) => {
            const next = v as "liste" | "ek" | "rezepte";
            setTabValue(next);
            setSubtab(next === "rezepte" ? "liste" : (next as "liste" | "ek"));
          }}
        >
          <TabsList>
            <TabsTrigger value="liste">Verkaufsartikel</TabsTrigger>
            <TabsTrigger value="ek">EK-Zuordnung</TabsTrigger>
            {canManageRecipes.data && <TabsTrigger value="rezepte">Rezepte</TabsTrigger>}
          </TabsList>
          <TabsContent value="ek" className="pt-4">
            <EkZuordnungTab
              locationId={locationId}
              onCreateRecipeFor={canManageRecipes.data ? startRecipeForArticle : undefined}
            />
          </TabsContent>
          {canManageRecipes.data && (
            <TabsContent value="rezepte" className="pt-4">
              <RezepteTab
                locationId={locationId}
                initialCreateForSalesArticleId={pendingRecipeForArticleId}
                onConsumedInitialCreate={() => setPendingRecipeForArticleId(null)}
              />
            </TabsContent>
          )}
          <TabsContent value="liste" className="pt-4" />
        </Tabs>
      )}

      {(!isAdmin || (subtab === "liste" && tabValue === "liste")) && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche nach Name…"
              className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <SalesGroupFilter
              rows={rows}
              haupt={haupt}
              setHaupt={setHaupt}
              unter={unter}
              setUnter={setUnter}
              wg={wg}
              setWg={setWg}
              allowedHauptLabels={["Küche", "Getränke"]}
              blockedUnterLabels={["Divers", "FFP2", "Hilf Mahl", "Hilfmal"]}
              blockedWgLabels={[
                "FFP2",
                "Getränke offen",
                "Heißgetränke",
                "Hilf mahl",
                "Hilf mal",
                "Küche offen",
                "Liefergebühr",
                "TakeAway",
                "Take Away",
                "Thai Fusion",
                "Thai Pinto 4 Talon",
                "Thai Pinto 5 Talon",
                "Zusatztexte",
              ]}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Inaktive anzeigen
            </label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Fehler</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {articlesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Artikel gefunden.</p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Hauptgruppe</TableHead>
                    <TableHead className="w-32">Untergruppe</TableHead>
                    <TableHead className="w-32">Warengruppe</TableHead>
                    <TableHead className="w-36">Preis</TableHead>
                    <TableHead className="w-36">Mitnahme</TableHead>
                    {isAdmin && <TableHead className="w-32">EK</TableHead>}
                    {isAdmin && (
                      <TableHead className="w-24" title={WE_TOOLTIP}>
                        WE %
                      </TableHead>
                    )}
                    <TableHead className="w-28 text-right">Aktiv</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id} className={row.isActive ? "" : "opacity-60"}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => setEditRow(row)}
                          className="text-left hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded"
                        >
                          {row.name}
                        </button>
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground"
                        title={row.hauptgruppeNr !== null ? `Nr. ${row.hauptgruppeNr}` : undefined}
                      >
                        {row.hauptgruppe ??
                          (row.hauptgruppeNr !== null ? `#${row.hauptgruppeNr}` : "—")}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground"
                        title={row.untergruppeNr !== null ? `Nr. ${row.untergruppeNr}` : undefined}
                      >
                        {row.untergruppe ??
                          (row.untergruppeNr !== null ? `#${row.untergruppeNr}` : "—")}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground"
                        title={row.productGroup !== null ? `Nr. ${row.productGroup}` : undefined}
                      >
                        {row.warengruppe ??
                          (row.productGroup !== null ? `#${row.productGroup}` : "—")}
                      </TableCell>
                      <TableCell>
                        <PriceCell
                          article={row}
                          field="priceCents"
                          onSave={(cents) =>
                            updateMut.mutate({ data: { id: row.id, priceCents: cents } })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <PriceCell
                          article={row}
                          field="takeawayPriceCents"
                          onSave={(cents) =>
                            updateMut.mutate({ data: { id: row.id, takeawayPriceCents: cents } })
                          }
                        />
                      </TableCell>
                      {isAdmin && (
                        <TableCell
                          title={
                            row.ekPriceCents !== null && row.priceCents !== null
                              ? `Marge: ${formatEuro(row.priceCents - row.ekPriceCents)}`
                              : undefined
                          }
                        >
                          <div className="flex flex-col">
                            <PriceCell
                              article={row}
                              field="ekPriceCents"
                              onSave={(cents) =>
                                updateMut.mutate({ data: { id: row.id, ekPriceCents: cents } })
                              }
                            />
                            {canManageRecipes.data &&
                              row.ekPriceCents === null &&
                              row.recipeId === null &&
                              row.ekSourceArticleId === null && (
                                <button
                                  type="button"
                                  onClick={() => startRecipeForArticle(row.id)}
                                  className="mt-0.5 self-start px-2 text-[11px] text-muted-foreground underline hover:text-foreground"
                                >
                                  Rezept anlegen
                                </button>
                              )}
                          </div>
                        </TableCell>
                      )}
                      {isAdmin && (
                        <TableCell>
                          <WeBadge pct={wareneinsatzQuote(row.ekPriceCents, row.priceCents)} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={(v) =>
                            updateMut.mutate({ data: { id: row.id, isActive: v } })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {rows.length} Artikel · {activeCount} aktiv
          </p>

          {addOpen && (
            <AddArticleDialog
              isAdmin={isAdmin}
              submitting={createMut.isPending}
              onClose={() => setAddOpen(false)}
              onSubmit={(input) => createMut.mutate({ data: { ...input, locationId } })}
            />
          )}
          {editRow && (
            <EditGroupsDialog
              isAdmin={isAdmin}
              article={editRow}
              submitting={updateMut.isPending}
              onClose={() => setEditRow(null)}
              onSubmit={(patch) => {
                updateMut.mutate(
                  { data: { id: editRow.id, ...patch } },
                  { onSuccess: () => setEditRow(null) },
                );
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline-editierbare Preiszelle
// ---------------------------------------------------------------------------

function PriceCell(props: {
  article: SalesArticle;
  field: PriceField;
  onSave: (cents: number | null) => void;
}) {
  const current = props.article[props.field];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(centsToEuroInput(current));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(centsToEuroInput(current));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, current]);

  const commit = () => {
    const cents = parseEuroInputToCents(value);
    if (cents === "invalid") {
      setValue(centsToEuroInput(current));
      setEditing(false);
      return;
    }
    if (cents !== current) props.onSave(cents);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={
          "w-full rounded px-2 py-1 text-left hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring " +
          (current === null ? "text-muted-foreground" : "")
        }
        aria-label="Preis bearbeiten"
      >
        {current === null ? "—" : formatEuro(current)}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setValue(centsToEuroInput(current));
          setEditing(false);
        }
      }}
      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
      inputMode="decimal"
      placeholder="— (leer für POS-Technik)"
    />
  );
}

function centsToEuroInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function parseEuroInputToCents(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return "invalid";
  const euro = Number(normalized);
  if (!Number.isFinite(euro) || euro < 0) return "invalid";
  return Math.round(euro * 100);
}

// ---------------------------------------------------------------------------
// Dialog: Artikel anlegen
// ---------------------------------------------------------------------------

function AddArticleDialog(props: {
  isAdmin: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    productGroup: number | null;
    priceCents: number | null;
    takeawayPriceCents: number | null;
    ekPriceCents: number | null;
    warengruppe: string | null;
    untergruppe: string | null;
    untergruppeNr: number | null;
    hauptgruppe: string | null;
    hauptgruppeNr: number | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [price, setPrice] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [ek, setEk] = useState("");
  const [warengruppe, setWarengruppe] = useState("");
  const [untergruppe, setUntergruppe] = useState("");
  const [untergruppeNr, setUntergruppeNr] = useState("");
  const [hauptgruppe, setHauptgruppe] = useState("");
  const [hauptgruppeNr, setHauptgruppeNr] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalErr("Name ist Pflicht.");
      return;
    }
    const pg = productGroup.trim();
    let productGroupParsed: number | null = null;
    if (pg !== "") {
      const n = Number(pg);
      if (!Number.isInteger(n)) {
        setLocalErr("Warengruppe muss eine Zahl sein.");
        return;
      }
      productGroupParsed = n;
    }
    const parseIntOrNull = (raw: string, label: string): number | null | "invalid" => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isInteger(n)) {
        setLocalErr(`${label} muss eine Zahl sein.`);
        return "invalid";
      }
      return n;
    };
    const untergruppeNrParsed = parseIntOrNull(untergruppeNr, "Untergruppe Nr.");
    if (untergruppeNrParsed === "invalid") return;
    const hauptgruppeNrParsed = parseIntOrNull(hauptgruppeNr, "Hauptgruppe Nr.");
    if (hauptgruppeNrParsed === "invalid") return;
    const priceCents = parseEuroInputToCents(price);
    if (priceCents === "invalid") {
      setLocalErr("Preis: nur Zahlen und Komma (max. 2 Nachkommastellen).");
      return;
    }
    const takeawayCents = parseEuroInputToCents(takeaway);
    if (takeawayCents === "invalid") {
      setLocalErr("Mitnahme: nur Zahlen und Komma (max. 2 Nachkommastellen).");
      return;
    }
    const ekCents = props.isAdmin ? parseEuroInputToCents(ek) : null;
    if (ekCents === "invalid") {
      setLocalErr("EK: nur Zahlen und Komma (max. 2 Nachkommastellen).");
      return;
    }
    setLocalErr(null);
    props.onSubmit({
      name: trimmed,
      productGroup: productGroupParsed,
      priceCents,
      takeawayPriceCents: takeawayCents,
      ekPriceCents: ekCents,
      warengruppe: warengruppe.trim() || null,
      untergruppe: untergruppe.trim() || null,
      untergruppeNr: untergruppeNrParsed,
      hauptgruppe: hauptgruppe.trim() || null,
      hauptgruppeNr: hauptgruppeNrParsed,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verkaufsartikel anlegen</DialogTitle>
          <DialogDescription>
            Preise leer lassen für POS-Technik (Modifikator, Sammel-PLU, Rabatt).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              placeholder="z. B. Mangosaft"
            />
          </label>
          <HierarchyFieldset
            hauptgruppe={hauptgruppe}
            setHauptgruppe={setHauptgruppe}
            hauptgruppeNr={hauptgruppeNr}
            setHauptgruppeNr={setHauptgruppeNr}
            untergruppe={untergruppe}
            setUntergruppe={setUntergruppe}
            untergruppeNr={untergruppeNr}
            setUntergruppeNr={setUntergruppeNr}
            warengruppe={warengruppe}
            setWarengruppe={setWarengruppe}
            productGroup={productGroup}
            setProductGroup={setProductGroup}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Preis (€)</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                placeholder="4,20"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Mitnahme (€)</span>
              <input
                value={takeaway}
                onChange={(e) => setTakeaway(e.target.value)}
                inputMode="decimal"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                placeholder="optional"
              />
            </label>
          </div>
          {props.isAdmin && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">EK (€) — nur Admin</span>
              <input
                value={ek}
                onChange={(e) => setEk(e.target.value)}
                inputMode="decimal"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                placeholder="optional"
              />
            </label>
          )}
          {localErr && <p className="text-xs text-destructive">{localErr}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Abbrechen
          </Button>
          <Button disabled={props.submitting} onClick={submit}>
            {props.submitting ? "Speichern…" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Dialog: Hierarchie bearbeiten
// ---------------------------------------------------------------------------

type GroupsPatch = {
  warengruppe: string | null;
  untergruppe: string | null;
  untergruppeNr: number | null;
  hauptgruppe: string | null;
  hauptgruppeNr: number | null;
  productGroup: number | null;
  ekPriceCents?: number | null;
};

function EditGroupsDialog(props: {
  isAdmin: boolean;
  article: SalesArticle;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (patch: GroupsPatch) => void;
}) {
  const a = props.article;
  const [hauptgruppe, setHauptgruppe] = useState(a.hauptgruppe ?? "");
  const [hauptgruppeNr, setHauptgruppeNr] = useState(
    a.hauptgruppeNr === null ? "" : String(a.hauptgruppeNr),
  );
  const [untergruppe, setUntergruppe] = useState(a.untergruppe ?? "");
  const [untergruppeNr, setUntergruppeNr] = useState(
    a.untergruppeNr === null ? "" : String(a.untergruppeNr),
  );
  const [warengruppe, setWarengruppe] = useState(a.warengruppe ?? "");
  const [productGroup, setProductGroup] = useState(
    a.productGroup === null ? "" : String(a.productGroup),
  );
  const [ek, setEk] = useState(
    a.ekPriceCents === null || a.ekPriceCents === undefined
      ? ""
      : (a.ekPriceCents / 100).toFixed(2).replace(".", ","),
  );
  const [localErr, setLocalErr] = useState<string | null>(null);

  const submit = () => {
    const parseInt = (raw: string, label: string): number | null | "invalid" => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isInteger(n)) {
        setLocalErr(`${label} muss eine Zahl sein.`);
        return "invalid";
      }
      return n;
    };
    const pg = parseInt(productGroup, "Warengruppe Nr.");
    if (pg === "invalid") return;
    const un = parseInt(untergruppeNr, "Untergruppe Nr.");
    if (un === "invalid") return;
    const hn = parseInt(hauptgruppeNr, "Hauptgruppe Nr.");
    if (hn === "invalid") return;
    let ekCents: number | null | undefined = undefined;
    if (props.isAdmin) {
      const parsed = parseEuroInputToCents(ek);
      if (parsed === "invalid") {
        setLocalErr("EK: nur Zahlen und Komma (max. 2 Nachkommastellen).");
        return;
      }
      ekCents = parsed;
    }
    setLocalErr(null);
    props.onSubmit({
      hauptgruppe: hauptgruppe.trim() || null,
      hauptgruppeNr: hn,
      untergruppe: untergruppe.trim() || null,
      untergruppeNr: un,
      warengruppe: warengruppe.trim() || null,
      productGroup: pg,
      ...(props.isAdmin ? { ekPriceCents: ekCents } : {}),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Artikel bearbeiten — {a.name}</DialogTitle>
          <DialogDescription>Quelle Vectron — wird beim Re-Import überschrieben.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <HierarchyFieldset
            hauptgruppe={hauptgruppe}
            setHauptgruppe={setHauptgruppe}
            hauptgruppeNr={hauptgruppeNr}
            setHauptgruppeNr={setHauptgruppeNr}
            untergruppe={untergruppe}
            setUntergruppe={setUntergruppe}
            untergruppeNr={untergruppeNr}
            setUntergruppeNr={setUntergruppeNr}
            warengruppe={warengruppe}
            setWarengruppe={setWarengruppe}
            productGroup={productGroup}
            setProductGroup={setProductGroup}
          />
          {props.isAdmin && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">EK (€) — nur Admin</span>
              <input
                value={ek}
                onChange={(e) => setEk(e.target.value)}
                inputMode="decimal"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                placeholder="optional"
              />
            </label>
          )}
          {localErr && <p className="text-xs text-destructive">{localErr}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Abbrechen
          </Button>
          <Button disabled={props.submitting} onClick={submit}>
            {props.submitting ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HierarchyFieldset(props: {
  hauptgruppe: string;
  setHauptgruppe: (v: string) => void;
  hauptgruppeNr: string;
  setHauptgruppeNr: (v: string) => void;
  untergruppe: string;
  setUntergruppe: (v: string) => void;
  untergruppeNr: string;
  setUntergruppeNr: (v: string) => void;
  warengruppe: string;
  setWarengruppe: (v: string) => void;
  productGroup: string;
  setProductGroup: (v: string) => void;
}) {
  const inputCls = "w-full rounded border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Quelle Vectron — wird beim Re-Import überschrieben.
      </p>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Hauptgruppe</span>
          <input
            value={props.hauptgruppe}
            onChange={(e) => props.setHauptgruppe(e.target.value)}
            className={inputCls}
            placeholder="z. B. Küche"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nr.</span>
          <input
            value={props.hauptgruppeNr}
            onChange={(e) => props.setHauptgruppeNr(e.target.value)}
            inputMode="numeric"
            className={inputCls}
            placeholder="5"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Untergruppe</span>
          <input
            value={props.untergruppe}
            onChange={(e) => props.setUntergruppe(e.target.value)}
            className={inputCls}
            placeholder="z. B. Vorspeisen"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nr.</span>
          <input
            value={props.untergruppeNr}
            onChange={(e) => props.setUntergruppeNr(e.target.value)}
            inputMode="numeric"
            className={inputCls}
            placeholder="12"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Warengruppe</span>
          <input
            value={props.warengruppe}
            onChange={(e) => props.setWarengruppe(e.target.value)}
            className={inputCls}
            placeholder="z. B. Appetizer"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nr.</span>
          <input
            value={props.productGroup}
            onChange={(e) => props.setProductGroup(e.target.value)}
            inputMode="numeric"
            className={inputCls}
            placeholder="43"
          />
        </label>
      </div>
    </div>
  );
}
