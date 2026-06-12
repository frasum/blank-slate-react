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
  return (
    <div className="flex max-w-lg items-center gap-2">
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
        onClick={() => props.onDelete()}
        className="rounded-md px-3 py-2 text-sm text-destructive hover:underline"
      >
        Löschen
      </button>
    </div>
  );
}