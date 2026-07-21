// ST1-A — Stammdaten-Verwaltung: Kategorien & Einheiten.
// Admin-only (Tab-Gate erfolgt in einstellungen.index.tsx + route.tsx).
// Zwei Karten nebeneinander; je Karte: Neu anlegen, Liste alphabetisch,
// Inline-Umbenennen (Click-to-edit, Enter/Escape) und Löschen mit Bestätigung.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createTaxonomyEntry,
  deleteTaxonomyEntry,
  listTaxonomy,
  renameTaxonomyEntry,
} from "@/lib/bestellung/taxonomy.functions";
import type { TaxonomyKind } from "@/lib/bestellung/taxonomy";
import { Button } from "@/components/ui/button";

const TAXONOMY_KEY = ["settings", "taxonomy"] as const;
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
  const [newName, setNewName] = useState("");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TAXONOMY_KEY }),
      queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY }),
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
              disabled={renameM.isPending || deleteM.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  onRename,
  onDelete,
  disabled,
}: {
  entry: Entry;
  onRename: (newName: string) => void;
  onDelete: () => void;
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
