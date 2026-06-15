import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
} from "@/lib/admin/locations.functions";
import {
  getDisplaySettings,
  regenerateDisplayToken,
  upsertDisplaySettings,
} from "@/lib/display/display.functions";

export const Route = createFileRoute("/_authenticated/admin/locations")({
  head: () => ({ meta: [{ title: "Standorte · Verwaltung" }] }),
  component: LocationsPage,
});

function LocationsPage() {
  const queryClient = useQueryClient();
  const callCreate = useServerFn(createLocation);
  const callUpdate = useServerFn(updateLocation);
  const callDelete = useServerFn(deleteLocation);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "locations"] });

  const createMut = useMutation({
    mutationFn: () => callCreate({ data: { name: newName } }),
    onSuccess: () => {
      setNewName("");
      setMsg(null);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      callUpdate({ data: { locationId: id, name } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => callDelete({ data: { locationId: id } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Standorte</h1>

      <form
        className="flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          createMut.mutate();
        }}
      >
        <input
          required
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Standortname"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={createMut.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Anlegen
        </button>
      </form>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {locationsQ.data && (
        <div className="space-y-2">
          {locationsQ.data.map((loc) => (
            <LocationRow
              key={loc.id}
              id={loc.id}
              name={loc.name}
              onSave={(name) => updateMut.mutate({ id: loc.id, name })}
              onDelete={() => deleteMut.mutate(loc.id)}
            />
          ))}
          {locationsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Standorte.</p>
          )}
        </div>
      )}
    </div>
  );
}

function LocationRow(props: {
  id: string;
  name: string;
  onSave: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(props.name);
  const [displayOpen, setDisplayOpen] = useState(false);
  return (
    <div className="max-w-lg space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => props.onSave(name)}
          disabled={name === props.name}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          Speichern
        </button>
        <button
          onClick={() => setDisplayOpen((v) => !v)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent"
        >
          Display
        </button>
        <button
          onClick={() => props.onDelete()}
          className="rounded-md px-3 py-2 text-sm text-destructive hover:underline"
        >
          Löschen
        </button>
      </div>
      {displayOpen && <DisplayPanel locationId={props.id} />}
    </div>
  );
}

function DisplayPanel({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const callGet = useServerFn(getDisplaySettings);
  const callUpsert = useServerFn(upsertDisplaySettings);
  const callRegen = useServerFn(regenerateDisplayToken);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["display-settings", locationId],
    queryFn: () => callGet({ data: { locationId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["display-settings", locationId] });

  const upsertMut = useMutation({
    mutationFn: (input: { isEnabled?: boolean; refreshIntervalSeconds?: number }) =>
      callUpsert({ data: { locationId, ...input } }),
    onSuccess: () => {
      setMsg(null);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const regenMut = useMutation({
    mutationFn: () => callRegen({ data: { locationId } }),
    onSuccess: () => {
      setMsg("Neuer Token generiert. Alte URLs sind ungültig.");
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  if (settingsQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Display-Einstellungen werden geladen …</p>;
  }

  const settings = settingsQ.data;

  if (!settings) {
    return (
      <div className="rounded-md border border-input bg-muted/30 p-3 text-sm">
        <p className="mb-2 text-muted-foreground">Noch kein Display für diesen Standort.</p>
        <button
          onClick={() => upsertMut.mutate({ isEnabled: true })}
          disabled={upsertMut.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Display einrichten
        </button>
        {msg && <p className="mt-2 text-destructive">{msg}</p>}
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const displayUrl = `${origin}/display/${settings.location_id}?token=${settings.display_token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg("Kopieren fehlgeschlagen.");
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-input bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.is_enabled}
            onChange={(e) => upsertMut.mutate({ isEnabled: e.target.checked })}
          />
          <span>Aktiv</span>
        </label>
        <span className="ml-auto text-muted-foreground">
          Refresh:
          <input
            type="number"
            min={15}
            max={3600}
            defaultValue={settings.refresh_interval_seconds}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v) && v !== settings.refresh_interval_seconds) {
                upsertMut.mutate({ refreshIntervalSeconds: v });
              }
            }}
            className="ml-1 w-20 rounded border border-input bg-background px-2 py-1"
          />
          <span className="ml-1">Sek.</span>
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Anzeige-URL</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={displayUrl}
            className="flex-1 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            className="rounded border border-input bg-background px-3 py-1 hover:bg-accent"
          >
            {copied ? "Kopiert" : "Kopieren"}
          </button>
          <a
            href={displayUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-input bg-background px-3 py-1 hover:bg-accent"
          >
            Öffnen
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (confirm("Neuen Token generieren? Die alte URL wird ungültig.")) {
              regenMut.mutate();
            }
          }}
          disabled={regenMut.isPending}
          className="rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Token neu generieren
        </button>
      </div>

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
