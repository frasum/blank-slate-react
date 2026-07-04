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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/bestellung/verkaufsartikel")({
  head: () => ({ meta: [{ title: "Verkaufsartikel · Bestellung" }] }),
  component: VerkaufsartikelPage,
});

type PriceField = "priceCents" | "takeawayPriceCents";

function VerkaufsartikelPage() {
  const qc = useQueryClient();
  const callList = useServerFn(listSalesArticles);
  const callUpdate = useServerFn(updateSalesArticle);
  const callCreate = useServerFn(createSalesArticle);

  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: () => listLocations(),
  });
  const locations = locationsQ.data ?? [];

  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0].id);
  }, [locations, locationId]);

  const articlesQ = useQuery({
    queryKey: ["sales-articles", locationId],
    queryFn: () => callList({ data: { locationId } }),
    enabled: !!locationId,
  });
  const rows = articlesQ.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-articles", locationId] });

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("__all__");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const groups = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) if (r.productGroup !== null) s.add(r.productGroup);
    return Array.from(s).sort((a, b) => a - b);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.isActive) return false;
      if (group !== "__all__" && String(r.productGroup ?? "") !== group) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, group, showInactive]);

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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Name…"
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Warengruppe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alle Warengruppen</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g} value={String(g)}>
                WG {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <TableHead className="w-24">WG</TableHead>
                <TableHead className="w-36">Preis</TableHead>
                <TableHead className="w-36">Mitnahme</TableHead>
                <TableHead className="w-24 text-right">Aktiv</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className={row.isActive ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.productGroup ?? "—"}
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
          submitting={createMut.isPending}
          onClose={() => setAddOpen(false)}
          onSubmit={(input) =>
            createMut.mutate({ data: { ...input, locationId } })
          }
        />
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
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    productGroup: number | null;
    priceCents: number | null;
    takeawayPriceCents: number | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [price, setPrice] = useState("");
  const [takeaway, setTakeaway] = useState("");
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
    setLocalErr(null);
    props.onSubmit({
      name: trimmed,
      productGroup: productGroupParsed,
      priceCents,
      takeawayPriceCents: takeawayCents,
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
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Warengruppe (Nr.)</span>
            <input
              value={productGroup}
              onChange={(e) => setProductGroup(e.target.value)}
              inputMode="numeric"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              placeholder="optional"
            />
          </label>
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