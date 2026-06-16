import { useEffect, useState } from "react";
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

type LocationDetails = {
  street: string;
  postal_code: string;
  city: string;
  delivery_notes: string;
  phone: string;
  contact_name: string;
  contact_phone: string;
};

const emptyDetails: LocationDetails = {
  street: "",
  postal_code: "",
  city: "",
  delivery_notes: "",
  phone: "",
  contact_name: "",
  contact_phone: "",
};

function toPayload(d: LocationDetails) {
  return {
    street: d.street || null,
    postal_code: d.postal_code || null,
    city: d.city || null,
    delivery_notes: d.delivery_notes || null,
    phone: d.phone || null,
    contact_name: d.contact_name || null,
    contact_phone: d.contact_phone || null,
  };
}

function LocationsPage() {
  const queryClient = useQueryClient();
  const callCreate = useServerFn(createLocation);
  const callUpdate = useServerFn(updateLocation);
  const callDelete = useServerFn(deleteLocation);
  const [newName, setNewName] = useState("");
  const [newDetails, setNewDetails] = useState<LocationDetails>(emptyDetails);
  const [msg, setMsg] = useState<string | null>(null);

  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "locations"] });

  const createMut = useMutation({
    mutationFn: () => callCreate({ data: { name: newName, ...toPayload(newDetails) } }),
    onSuccess: () => {
      setNewName("");
      setNewDetails(emptyDetails);
      setMsg(null);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const updateMut = useMutation({
    mutationFn: ({
      id,
      name,
      details,
    }: {
      id: string;
      name: string;
      details: LocationDetails;
    }) => callUpdate({ data: { locationId: id, name, ...toPayload(details) } }),
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
        className="max-w-2xl space-y-3 rounded-md border border-input bg-muted/30 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          createMut.mutate();
        }}
      >
        <p className="text-sm font-medium text-foreground">Neuen Standort anlegen</p>
        <Field label="Name *">
          <input
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Standortname"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <DetailsFields value={newDetails} onChange={setNewDetails} />
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
        <div className="space-y-3">
          {locationsQ.data.map((loc) => (
            <LocationRow
              key={loc.id}
              loc={loc}
              onSave={(name, details) => updateMut.mutate({ id: loc.id, name, details })}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function DetailsFields({
  value,
  onChange,
}: {
  value: LocationDetails;
  onChange: (next: LocationDetails) => void;
}) {
  const set = <K extends keyof LocationDetails>(key: K, v: string) =>
    onChange({ ...value, [key]: v });
  const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Telefon (Standort)">
          <input
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
            maxLength={40}
            className={inputCls}
          />
        </Field>
        <div />
        <Field label="Kontaktperson · Name">
          <input
            value={value.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
            maxLength={120}
            className={inputCls}
          />
        </Field>
        <Field label="Kontaktperson · Telefon">
          <input
            value={value.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
            maxLength={40}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Straße & Hausnummer">
        <input
          value={value.street}
          onChange={(e) => set("street", e.target.value)}
          maxLength={200}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="PLZ">
          <input
            value={value.postal_code}
            onChange={(e) => set("postal_code", e.target.value)}
            maxLength={20}
            className={inputCls}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Ort">
            <input
              value={value.city}
              onChange={(e) => set("city", e.target.value)}
              maxLength={120}
              className={inputCls}
            />
          </Field>
        </div>
      </div>
      <Field label="Lieferhinweise">
        <textarea
          value={value.delivery_notes}
          onChange={(e) => set("delivery_notes", e.target.value)}
          maxLength={500}
          rows={2}
          className={inputCls}
        />
      </Field>
    </div>
  );
}

type LocationRowData = {
  id: string;
  name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  delivery_notes: string | null;
  phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

function LocationRow(props: {
  loc: LocationRowData;
  onSave: (name: string, details: LocationDetails) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(props.loc.name);
  const [details, setDetails] = useState<LocationDetails>(() => ({
    street: props.loc.street ?? "",
    postal_code: props.loc.postal_code ?? "",
    city: props.loc.city ?? "",
    delivery_notes: props.loc.delivery_notes ?? "",
    phone: props.loc.phone ?? "",
    contact_name: props.loc.contact_name ?? "",
    contact_phone: props.loc.contact_phone ?? "",
  }));
  const [open, setOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);

  // Wenn der Server-State sich ändert (z. B. nach Refresh), lokalen State synchronisieren.
  useEffect(() => {
    setName(props.loc.name);
    setDetails({
      street: props.loc.street ?? "",
      postal_code: props.loc.postal_code ?? "",
      city: props.loc.city ?? "",
      delivery_notes: props.loc.delivery_notes ?? "",
      phone: props.loc.phone ?? "",
      contact_name: props.loc.contact_name ?? "",
      contact_phone: props.loc.contact_phone ?? "",
    });
  }, [props.loc]);

  const dirty =
    name !== props.loc.name ||
    details.street !== (props.loc.street ?? "") ||
    details.postal_code !== (props.loc.postal_code ?? "") ||
    details.city !== (props.loc.city ?? "") ||
    details.delivery_notes !== (props.loc.delivery_notes ?? "") ||
    details.phone !== (props.loc.phone ?? "") ||
    details.contact_name !== (props.loc.contact_name ?? "") ||
    details.contact_phone !== (props.loc.contact_phone ?? "");

  const summary = [
    [props.loc.street, [props.loc.postal_code, props.loc.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    props.loc.phone,
    props.loc.contact_name &&
      `${props.loc.contact_name}${props.loc.contact_phone ? ` (${props.loc.contact_phone})` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-2xl space-y-2 rounded-md border border-input bg-background p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left"
          aria-expanded={open}
        >
          <p className="text-sm font-medium text-foreground">{props.loc.name}</p>
          {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
        </button>
        <button
          onClick={() => setDisplayOpen((v) => !v)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          Display
        </button>
        <button
          onClick={() => props.onDelete()}
          className="rounded-md px-3 py-1.5 text-sm text-destructive hover:underline"
        >
          Löschen
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-input pt-3">
          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <DetailsFields value={details} onChange={setDetails} />
          <button
            onClick={() => props.onSave(name, details)}
            disabled={!dirty || name.trim() === ""}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      )}
      {displayOpen && <DisplayPanel locationId={props.loc.id} />}
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
