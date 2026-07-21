// ST1-A — Stammdaten-Verwaltung: Kategorien & Einheiten.
// Admin-only (Tab-Gate erfolgt in einstellungen.index.tsx + route.tsx).
// Zwei Karten nebeneinander; je Karte: Neu anlegen, Liste alphabetisch,
// Inline-Umbenennen (Click-to-edit, Enter/Escape) und Löschen mit Bestätigung.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createTaxonomyEntry,
  deleteTaxonomyEntry,
  listTaxonomy,
  listUnknownTaxonomyValues,
  mergeTaxonomyEntries,
  previewTaxonomyMerge,
  renameTaxonomyEntry,
} from "@/lib/bestellung/taxonomy.functions";
import type { TaxonomyKind } from "@/lib/bestellung/taxonomy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TAXONOMY_KEY = ["settings", "taxonomy"] as const;
const UNKNOWN_KEY = ["settings", "taxonomy", "unknown"] as const;
// Wenn Werte umbenannt werden, ziehen sich die Artikel mit — die
// Artikel-Massenpflege muss deshalb ebenfalls neu geladen werden.
const ARTIKEL_KEY = ["settings", "artikel-pflege", "articles", { includeInactive: true }] as const;

type Entry = { id: string; name: string };

export function TaxonomySection() {
  const q = useQuery({ queryKey: TAXONOMY_KEY, queryFn: () => listTaxonomy() });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">Stammdaten konnten nicht geladen werden.</p>;

  const categories = q.data?.categories ?? [];
  const units = q.data?.units ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Kategorien & Einheiten</h2>
        <p className="text-sm text-muted-foreground">
          Kuratierte Listen für Bestellartikel. Umbenennen zieht die Werte in allen Artikeln
          automatisch mit.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TaxonomyCard kind="category" title="Kategorien" entries={categories} />
        <TaxonomyCard kind="unit" title="Einheiten" entries={units} />
      </div>
      <UnknownValuesSection />
    </section>
  );
}

function TaxonomyCard({
  kind,
  title,
  entries,
}: {
  kind: TaxonomyKind;
  title: string;
  entries: Entry[];
}) {
  const queryClient = useQueryClient();
  const callCreate = useServerFn(createTaxonomyEntry);
  const callRename = useServerFn(renameTaxonomyEntry);
  const callDelete = useServerFn(deleteTaxonomyEntry);
  const callPreview = useServerFn(previewTaxonomyMerge);
  const callMerge = useServerFn(mergeTaxonomyEntries);
  const [newName, setNewName] = useState("");
  const [mergeSource, setMergeSource] = useState<Entry | null>(null);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TAXONOMY_KEY }),
      queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY }),
      queryClient.invalidateQueries({ queryKey: UNKNOWN_KEY }),
    ]);
  };

  const createM = useMutation({
    mutationFn: (name: string) => callCreate({ data: { kind, name } }),
    onSuccess: async () => {
      setNewName("");
      toast.success("Angelegt.");
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Anlegen fehlgeschlagen."),
  });

  const renameM = useMutation({
    mutationFn: (v: { entryId: string; newName: string }) => callRename({ data: v }),
    onSuccess: async (res) => {
      const n = (res as { articlesUpdated: number }).articlesUpdated;
      toast.success(n > 0 ? `Umbenannt — ${n} Artikel angepasst.` : "Umbenannt.");
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Umbenennen fehlgeschlagen."),
  });

  const deleteM = useMutation({
    mutationFn: (entryId: string) => callDelete({ data: { entryId } }),
    onSuccess: async () => {
      toast.success("Gelöscht.");
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen."),
  });

  const mergeM = useMutation({
    mutationFn: (v: { sourceEntryId: string; targetEntryId: string }) =>
      callMerge({ data: v }),
    onSuccess: async (res) => {
      const n = (res as { articlesUpdated: number }).articlesUpdated;
      toast.success(
        n > 0 ? `Zusammengelegt — ${n} Artikel angepasst.` : "Zusammengelegt (keine Artikel betroffen).",
      );
      setMergeSource(null);
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Zusammenlegen fehlgeschlagen."),
  });

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (trimmed === "") return;
    createM.mutate(trimmed);
  };

  return (
    <div className="rounded-md border border-border/60 bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="mb-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder={kind === "category" ? "z. B. Wein" : "z. B. kg"}
          className="min-w-0 flex-1 rounded border border-border/60 bg-background px-2 py-1 text-sm"
        />
        <Button
          type="button"
          size="sm"
          disabled={createM.isPending || newName.trim() === ""}
          onClick={handleCreate}
        >
          Neu
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Einträge.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onRename={(newName) => renameM.mutate({ entryId: e.id, newName })}
              onDelete={() => {
                if (window.confirm(`„${e.name}“ wirklich löschen?`)) {
                  deleteM.mutate(e.id);
                }
              }}
              onMerge={() => setMergeSource(e)}
              disabled={renameM.isPending || deleteM.isPending}
            />
          ))}
        </ul>
      )}
      <MergeDialog
        source={mergeSource}
        kind={kind}
        entries={entries}
        onClose={() => setMergeSource(null)}
        onPreview={async (sourceEntryId, targetEntryId) =>
          callPreview({ data: { sourceEntryId, targetEntryId } })
        }
        onConfirm={(sourceEntryId, targetEntryId) =>
          mergeM.mutate({ sourceEntryId, targetEntryId })
        }
        confirming={mergeM.isPending}
      />
    </div>
  );
}

function EntryRow({
  entry,
  onRename,
  onDelete,
  onMerge,
  disabled,
}: {
  entry: Entry;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMerge: () => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed === "" || trimmed === entry.name) return;
    onRename(trimmed);
  };

  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(entry.name);
              setEditing(false);
            }
          }}
          className="flex-1 rounded border border-border/60 bg-background px-2 py-0.5"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(entry.name);
            setEditing(true);
          }}
          className="flex-1 cursor-text rounded px-2 py-0.5 text-left hover:bg-muted/60"
          title="Umbenennen"
        >
          {entry.name}
        </button>
      )}
      <button
        type="button"
        onClick={onMerge}
        disabled={disabled}
        className="text-xs text-muted-foreground hover:text-foreground"
        title="Mit anderem Eintrag zusammenlegen"
      >
        Zusammenlegen …
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="text-xs text-muted-foreground hover:text-destructive"
        title="Löschen"
      >
        Löschen
      </button>
    </li>
  );
}

// ————— Merge-Dialog: Ziel wählen, Vorschau, bestätigen —————

type MergePreview = {
  kind: TaxonomyKind;
  sourceName: string;
  targetName: string;
  articlesAffected: number;
};

function MergeDialog({
  source,
  kind,
  entries,
  onClose,
  onPreview,
  onConfirm,
  confirming,
}: {
  source: Entry | null;
  kind: TaxonomyKind;
  entries: Entry[];
  onClose: () => void;
  onPreview: (sourceEntryId: string, targetEntryId: string) => Promise<MergePreview>;
  onConfirm: (sourceEntryId: string, targetEntryId: string) => void;
  confirming: boolean;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);

  const options = useMemo(
    () => entries.filter((e) => e.id !== source?.id),
    [entries, source],
  );

  useEffect(() => {
    if (!source) {
      setTargetId("");
      setPreview(null);
      setLoading(false);
      return;
    }
    setTargetId("");
    setPreview(null);
  }, [source]);

  useEffect(() => {
    if (!source || !targetId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    onPreview(source.id, targetId)
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.");
          setPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, targetId, onPreview]);

  return (
    <Dialog open={!!source} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "category" ? "Kategorie" : "Einheit"} zusammenlegen
          </DialogTitle>
        </DialogHeader>
        {source && (
          <div className="space-y-3 text-sm">
            <p>
              Quelle: <span className="font-medium">„{source.name}"</span>
            </p>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Ziel</span>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded border border-border/60 bg-background px-2 py-1 text-sm"
              >
                <option value="">— wählen —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            {loading && <p className="text-xs text-muted-foreground">Vorschau lädt…</p>}
            {preview && !loading && (
              <p className="rounded border border-border/60 bg-muted/40 px-3 py-2 text-xs">
                „{preview.sourceName}" → „{preview.targetName}": {preview.articlesAffected} Artikel
                werden umgezogen, der Eintrag „{preview.sourceName}" wird gelöscht.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Abbrechen
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!preview || confirming}
                onClick={() => onConfirm(source.id, targetId)}
              >
                Bestätigen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ————— Unbekannte Werte —————

function UnknownValuesSection() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: UNKNOWN_KEY, queryFn: () => listUnknownTaxonomyValues() });
  const callCreate = useServerFn(createTaxonomyEntry);
  const adopt = useMutation({
    mutationFn: (v: { kind: TaxonomyKind; name: string }) => callCreate({ data: v }),
    onSuccess: async () => {
      toast.success("In Liste übernommen.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TAXONOMY_KEY }),
        queryClient.invalidateQueries({ queryKey: UNKNOWN_KEY }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Anlegen fehlgeschlagen."),
  });

  if (q.isLoading) return null;
  const data = q.data ?? { categories: [], units: [] };
  const empty = data.categories.length === 0 && data.units.length === 0;

  return (
    <div className="rounded-md border border-border/60 bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Unbekannte Werte</h3>
      {empty ? (
        <p className="text-xs text-muted-foreground">
          Alle Artikel-Werte sind in den Listen erfasst. ✓
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <UnknownTable
            title="Kategorien"
            kind="category"
            rows={data.categories}
            onAdopt={(name) => adopt.mutate({ kind: "category", name })}
            disabled={adopt.isPending}
          />
          <UnknownTable
            title="Einheiten"
            kind="unit"
            rows={data.units}
            onAdopt={(name) => adopt.mutate({ kind: "unit", name })}
            disabled={adopt.isPending}
          />
        </div>
      )}
    </div>
  );
}

function UnknownTable({
  title,
  rows,
  onAdopt,
  disabled,
}: {
  title: string;
  kind: TaxonomyKind;
  rows: { name: string; count: number }[];
  onAdopt: (name: string) => void;
  disabled: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">Keine unbekannten Werte.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Wert</th>
            <th className="py-1 text-right">Anzahl</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border/40">
              <td className="py-1">{r.name}</td>
              <td className="py-1 text-right tabular-nums">{r.count}</td>
              <td className="py-1 text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onAdopt(r.name)}
                >
                  In Liste übernehmen
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
