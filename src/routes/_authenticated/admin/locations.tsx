import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import {
  createLocation,
  deleteLocation,
  geocodeLocation,
  listLocations,
  setLocationActive,
  updateLocation,
  updateLocationGeo,
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
  /** Soll-Wechselgeldbestand in Euro als Eingabe-String. Leer = Org-Default. */
  cash_balance_target_euro: string;
};

const emptyDetails: LocationDetails = {
  street: "",
  postal_code: "",
  city: "",
  delivery_notes: "",
  phone: "",
  contact_name: "",
  contact_phone: "",
  cash_balance_target_euro: "",
};

function toPayload(d: LocationDetails) {
  const eu = d.cash_balance_target_euro.trim().replace(",", ".");
  let cashBalanceTargetCents: number | null = null;
  if (eu !== "") {
    const n = Number.parseFloat(eu);
    if (Number.isFinite(n) && n >= 0) {
      cashBalanceTargetCents = Math.round(n * 100);
    }
  }
  return {
    street: d.street || null,
    postal_code: d.postal_code || null,
    city: d.city || null,
    delivery_notes: d.delivery_notes || null,
    phone: d.phone || null,
    contact_name: d.contact_name || null,
    contact_phone: d.contact_phone || null,
    cashBalanceTargetCents,
  };
}

function centsToEuroInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (Number(cents) / 100).toFixed(2);
}

function detailsFromLoc(loc: LocationRowData): LocationDetails {
  return {
    street: loc.street ?? "",
    postal_code: loc.postal_code ?? "",
    city: loc.city ?? "",
    delivery_notes: loc.delivery_notes ?? "",
    phone: loc.phone ?? "",
    contact_name: loc.contact_name ?? "",
    contact_phone: loc.contact_phone ?? "",
    cash_balance_target_euro: centsToEuroInput(loc.cashBalanceTargetCents),
  };
}

function LocationsPage() {
  const queryClient = useQueryClient();
  const callCreate = useServerFn(createLocation);
  const callUpdate = useServerFn(updateLocation);
  const callDelete = useServerFn(deleteLocation);
  const callSetActive = useServerFn(setLocationActive);
  const [newName, setNewName] = useState("");
  const [newDetails, setNewDetails] = useState<LocationDetails>(emptyDetails);
  const [msg, setMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // ST1: Bestätigungs-Dialoge (Löschen mit Namens-Eingabe; Deaktivieren/Aktivieren)
  const [confirmDelete, setConfirmDelete] = useState<LocationRowData | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [confirmActive, setConfirmActive] = useState<{
    loc: LocationRowData;
    next: boolean;
  } | null>(null);

  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    // Standort-Admin-Seite zeigt auch deaktivierte Standorte (gedämpft).
    queryFn: () => listLocations({ data: { includeInactive: true } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "locations"] });

  const createMut = useMutation({
    mutationFn: () => callCreate({ data: { name: newName, ...toPayload(newDetails) } }),
    onSuccess: () => {
      setNewName("");
      setNewDetails(emptyDetails);
      setMsg(null);
      setCreateOpen(false);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name, details }: { id: string; name: string; details: LocationDetails }) =>
      callUpdate({ data: { locationId: id, name, ...toPayload(details) } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => callDelete({ data: { locationId: id } }),
    onSuccess: () => {
      setConfirmDelete(null);
      setDeleteInput("");
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const setActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      callSetActive({ data: { locationId: id, isActive } }),
    onSuccess: () => {
      setConfirmActive(null);
      return refresh();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Standorte</h1>
        {!createOpen && (
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setCreateOpen(true);
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Neu
          </button>
        )}
      </div>

      {createOpen && (
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
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Anlegen
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setNewName("");
                setNewDetails(emptyDetails);
                setMsg(null);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {locationsQ.data && (
        <div className="space-y-3">
          {locationsQ.data.map((loc) => (
            <LocationRow
              key={loc.id}
              loc={loc}
              onSave={(name, details) => updateMut.mutate({ id: loc.id, name, details })}
              onDelete={() => {
                setMsg(null);
                setDeleteInput("");
                setConfirmDelete(loc);
              }}
              onToggleActive={(next) => {
                setMsg(null);
                setConfirmActive({ loc, next });
              }}
              onGeoChanged={refresh}
            />
          ))}
          {locationsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Standorte.</p>
          )}
        </div>
      )}

      {/* ST1: Bestätigungs-Dialog „Deaktivieren/Aktivieren" */}
      {confirmActive && (
        <ConfirmDialog
          title={
            confirmActive.next
              ? `„${confirmActive.loc.name}" wieder aktivieren?`
              : `„${confirmActive.loc.name}" deaktivieren?`
          }
          body={
            confirmActive.next
              ? "Der Standort erscheint wieder in allen Auswahl-Listen."
              : "Der Standort verschwindet aus allen Auswahl-Listen des Systems. Daten, Zuordnungen und Historie bleiben erhalten. Reaktivieren jederzeit möglich."
          }
          confirmLabel={confirmActive.next ? "Aktivieren" : "Deaktivieren"}
          destructive={!confirmActive.next}
          busy={setActiveMut.isPending}
          onConfirm={() =>
            setActiveMut.mutate({ id: confirmActive.loc.id, isActive: confirmActive.next })
          }
          onCancel={() => setConfirmActive(null)}
        />
      )}

      {/* ST1: Bestätigungs-Dialog „Löschen" mit Namens-Tipp */}
      {confirmDelete && (
        <ConfirmDialog
          title={`„${confirmDelete.name}" endgültig löschen?`}
          body={
            <>
              <p>
                Löschen ist nur möglich, wenn <strong>keine Mitarbeiter mehr zugeordnet</strong>{" "}
                sind (Server-Regel — Referenz-Prüfung bleibt unverändert die eigentliche Sicherung).
              </p>
              <p className="text-muted-foreground">
                Tipp: Zum Ausblenden reicht <em>Deaktivieren</em> — der Standort verschwindet aus
                allen Auswahl-Listen, alle Daten bleiben erhalten.
              </p>
              <p>
                Zum Bestätigen bitte den Namen tippen:{" "}
                <code className="rounded bg-muted px-1">{confirmDelete.name}</code>
              </p>
              <input
                autoFocus
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={confirmDelete.name}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </>
          }
          confirmLabel="Endgültig löschen"
          destructive
          busy={deleteMut.isPending}
          confirmDisabled={deleteInput.trim() !== confirmDelete.name}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteInput("");
          }}
        />
      )}
    </div>
  );
}

// ST1: kleiner, wiederverwendbarer Bestätigungs-Dialog
function ConfirmDialog(props: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={props.onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-md border border-input bg-background p-5 shadow-lg"
      >
        <h2 className="text-base font-semibold text-foreground">{props.title}</h2>
        <div className="space-y-2 text-sm text-foreground">{props.body}</div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy || props.confirmDisabled}
            className={
              (props.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 "
                : "bg-primary text-primary-foreground hover:bg-primary/90 ") +
              "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            }
          >
            {props.busy ? "…" : props.confirmLabel}
          </button>
        </div>
      </div>
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
      <Field label="Soll-Wechselgeldbestand (€) — leer = Org-Default">
        <input
          value={value.cash_balance_target_euro}
          onChange={(e) => set("cash_balance_target_euro", e.target.value)}
          inputMode="decimal"
          placeholder="2000.00"
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
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number | null;
  geocoded_at?: string | null;
  geocoded_address?: string | null;
  cashBalanceTargetCents?: number | null;
  cashBalanceTargetResolvedCents?: number | null;
  isActive?: boolean;
};

function LocationRow(props: {
  loc: LocationRowData;
  onSave: (name: string, details: LocationDetails) => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
  onGeoChanged: () => void;
}) {
  const [name, setName] = useState(props.loc.name);
  const [details, setDetails] = useState<LocationDetails>(() => detailsFromLoc(props.loc));
  const [open, setOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);

  // Wenn der Server-State sich ändert (z. B. nach Refresh), lokalen State synchronisieren.
  useEffect(() => {
    setName(props.loc.name);
    setDetails(detailsFromLoc(props.loc));
  }, [props.loc]);

  const dirty =
    name !== props.loc.name ||
    details.street !== (props.loc.street ?? "") ||
    details.postal_code !== (props.loc.postal_code ?? "") ||
    details.city !== (props.loc.city ?? "") ||
    details.delivery_notes !== (props.loc.delivery_notes ?? "") ||
    details.phone !== (props.loc.phone ?? "") ||
    details.contact_name !== (props.loc.contact_name ?? "") ||
    details.cash_balance_target_euro !== centsToEuroInput(props.loc.cashBalanceTargetCents) ||
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

  const isActive = props.loc.isActive !== false;
  return (
    <div
      className={
        "max-w-2xl space-y-2 rounded-md border border-input bg-background p-3 " +
        (isActive ? "" : "opacity-60")
      }
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-m-1 flex flex-1 items-start gap-2 rounded-md p-1 text-left hover:bg-accent/40"
          aria-expanded={open}
          aria-controls={`loc-panel-${props.loc.id}`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 inline-block text-muted-foreground transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              {props.loc.name}
              {!isActive && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal uppercase tracking-wide text-muted-foreground">
                  deaktiviert
                </span>
              )}
            </span>
            {summary ? (
              <span className="block text-xs text-muted-foreground">{summary}</span>
            ) : (
              <span className="block text-xs italic text-muted-foreground">
                Noch keine Adresse hinterlegt
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setDisplayOpen((v) => !v)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          Display
        </button>
        <button
          onClick={() => props.onToggleActive(!isActive)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          {isActive ? "Deaktivieren" : "Aktivieren"}
        </button>
        <button
          onClick={() => props.onDelete()}
          className="rounded-md px-3 py-1.5 text-sm text-destructive hover:underline"
        >
          Löschen
        </button>
      </div>
      {open && (
        <div
          id={`loc-panel-${props.loc.id}`}
          role="region"
          aria-label={props.loc.name}
          className="space-y-3 border-t border-input pt-3"
        >
          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <DetailsFields value={details} onChange={setDetails} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => props.onSave(name, details)}
              disabled={!dirty || name.trim() === ""}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              Zuklappen
            </button>
          </div>
        </div>
      )}
      {displayOpen && <DisplayPanel locationId={props.loc.id} />}
      {open && <GeofencePanel loc={props.loc} onChanged={props.onGeoChanged} />}
    </div>
  );
}

function GeofencePanel({ loc, onChanged }: { loc: LocationRowData; onChanged: () => void }) {
  const callGeocode = useServerFn(geocodeLocation);
  const callUpdate = useServerFn(updateLocationGeo);
  const [lat, setLat] = useState<string>(loc.latitude != null ? String(loc.latitude) : "");
  const [lng, setLng] = useState<string>(loc.longitude != null ? String(loc.longitude) : "");
  const [radius, setRadius] = useState<string>(String(loc.geofence_radius_m ?? 100));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setLat(loc.latitude != null ? String(loc.latitude) : "");
    setLng(loc.longitude != null ? String(loc.longitude) : "");
    setRadius(String(loc.geofence_radius_m ?? 100));
  }, [loc.latitude, loc.longitude, loc.geofence_radius_m]);

  const geocodeMut = useMutation({
    mutationFn: () => callGeocode({ data: { locationId: loc.id } }),
    onSuccess: (r) => {
      setMsg(`Geocodiert: ${r.formattedAddress}`);
      onChanged();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const latN = lat.trim() === "" ? null : Number(lat);
      const lngN = lng.trim() === "" ? null : Number(lng);
      const radN = Number(radius);
      return callUpdate({
        data: {
          locationId: loc.id,
          latitude: latN,
          longitude: lngN,
          geofenceRadiusM: radN,
        },
      });
    },
    onSuccess: () => {
      setMsg("Gespeichert.");
      onChanged();
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="mt-3 space-y-3 rounded-md border border-input bg-muted/30 p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Geofence</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Breitengrad">
          <input value={lat} onChange={(e) => setLat(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Längengrad">
          <input value={lng} onChange={(e) => setLng(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Radius (m)">
          <input
            type="number"
            min={10}
            max={5000}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => geocodeMut.mutate()}
          disabled={geocodeMut.isPending}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {geocodeMut.isPending ? "Geocodiere …" : "Aus Adresse geocodieren"}
        </button>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Speichern
        </button>
        {loc.geocoded_at && (
          <span className="text-xs text-muted-foreground">
            Geocodiert: {new Date(loc.geocoded_at).toLocaleString("de-DE")}
            {loc.geocoded_address ? ` — ${loc.geocoded_address}` : ""}
          </span>
        )}
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
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
    mutationFn: (input: {
      isEnabled?: boolean;
      refreshIntervalSeconds?: number;
      rotationEnabled?: boolean;
      rotationIntervalSeconds?: number;
      showAreas?: ("kitchen" | "service" | "gl")[] | null;
      showHeader?: boolean;
      showFooter?: boolean;
      customMessage?: string | null;
    }) => callUpsert({ data: { locationId, ...input } }),
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
        <div className="pt-2">
          <div className="inline-block rounded bg-white p-2">
            <QRCodeSVG value={displayUrl} size={140} />
          </div>
        </div>
      </div>

      <DisplayOptions settings={settings} onChange={(input) => upsertMut.mutate(input)} />

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

type DisplayOptionsInput = {
  rotationEnabled?: boolean;
  rotationIntervalSeconds?: number;
  showAreas?: ("kitchen" | "service" | "gl")[] | null;
  showHeader?: boolean;
  showFooter?: boolean;
  customMessage?: string | null;
};

function DisplayOptions({
  settings,
  onChange,
}: {
  settings: {
    rotation_enabled: boolean;
    rotation_interval_seconds: number;
    show_areas: string[] | null;
    show_header: boolean;
    show_footer: boolean;
    custom_message: string | null;
  };
  onChange: (input: DisplayOptionsInput) => void;
}) {
  const allAreas: ("kitchen" | "service" | "gl")[] = ["kitchen", "service", "gl"];
  const labels: Record<string, string> = { kitchen: "Küche", service: "Service", gl: "Sonstige" };
  const current = settings.show_areas ?? allAreas;
  const [msg, setMsg] = useState(settings.custom_message ?? "");

  useEffect(() => {
    setMsg(settings.custom_message ?? "");
  }, [settings.custom_message]);

  const toggleArea = (a: "kitchen" | "service" | "gl") => {
    const next = current.includes(a) ? current.filter((x) => x !== a) : [...current, a];
    const normalized = allAreas.filter((x) => next.includes(x));
    onChange({ showAreas: normalized.length === allAreas.length ? null : normalized });
  };

  return (
    <div className="space-y-3 rounded border border-input bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.rotation_enabled}
            onChange={(e) => onChange({ rotationEnabled: e.target.checked })}
          />
          <span>Rotation</span>
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          Intervall
          <select
            value={settings.rotation_interval_seconds}
            onChange={(e) => onChange({ rotationIntervalSeconds: Number(e.target.value) })}
            className="rounded border border-input bg-background px-2 py-1"
          >
            <option value={15}>15 s</option>
            <option value={30}>30 s</option>
            <option value={45}>45 s</option>
            <option value={60}>60 s</option>
          </select>
        </label>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Sichtbare Bereiche</p>
        <div className="mt-1 flex flex-wrap gap-3">
          {allAreas.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" checked={current.includes(a)} onChange={() => toggleArea(a)} />
              <span>{labels[a]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.show_header}
            onChange={(e) => onChange({ showHeader: e.target.checked })}
          />
          <span>Header anzeigen</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.show_footer}
            onChange={(e) => onChange({ showFooter: e.target.checked })}
          />
          <span>Legende anzeigen</span>
        </label>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Eigene Nachricht</p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value.slice(0, 280))}
          onBlur={() => {
            const next = msg.trim() === "" ? null : msg;
            if (next !== (settings.custom_message ?? null)) onChange({ customMessage: next });
          }}
          rows={2}
          maxLength={280}
          placeholder="z. B. „Heute Sonderöffnung bis 23 Uhr"
          className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-sm"
        />
      </div>
    </div>
  );
}
