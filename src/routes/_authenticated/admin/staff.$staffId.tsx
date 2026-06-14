import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  assignStaffLocations,
  getStaff,
  setStaffActive,
  setStaffRole,
  updateStaffBasics,
} from "@/lib/admin/staff.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { clearPin, setPin } from "@/lib/admin/pin.functions";
import { issueBadge, listBadges, revokeBadge } from "@/lib/admin/badges.functions";
import {
  assignStaffSkills,
  getStaffSkills,
  listSkills,
  type SkillCategory,
} from "@/lib/admin/skills.functions";

export const Route = createFileRoute("/_authenticated/admin/staff/$staffId")({
  head: () => ({ meta: [{ title: "Mitarbeiter · Verwaltung" }] }),
  component: StaffDetailPage,
});

type Tab = "basics" | "locations" | "skills" | "role" | "pin" | "badges";

function StaffDetailPage() {
  const { staffId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("basics");

  const staffQ = useQuery({
    queryKey: ["admin", "staff", staffId],
    queryFn: () => getStaff({ data: { staffId } }),
  });

  if (staffQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (staffQ.error || !staffQ.data)
    return <p className="text-sm text-destructive">Mitarbeiter nicht gefunden.</p>;

  const s = staffQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{s.displayName}</h1>
        <p className="text-sm text-muted-foreground">
          {s.isActive ? "aktiv" : "inaktiv"} · Rolle: {s.role ?? "—"}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {(
          [
            ["basics", "Stammdaten"],
            ["locations", "Standorte"],
            ["skills", "Skills"],
            ["role", "Rolle & Aktiv"],
            ["pin", "PIN"],
            ["badges", "Badges"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm ${
              tab === k
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "basics" && <BasicsTab staff={s} />}
      {tab === "locations" && <LocationsTab staffId={s.id} current={s.locationIds} />}
      {tab === "skills" && <SkillsTab staffId={s.id} />}
      {tab === "role" && <RoleTab staff={s} />}
      {tab === "pin" && <PinTab staffId={s.id} hasPin={s.hasPin} />}
      {tab === "badges" && <BadgesTab staffId={s.id} />}
    </div>
  );
}

function BasicsTab({
  staff,
}: {
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const callUpdate = useServerFn(updateStaffBasics);
  const [form, setForm] = useState({
    firstName: staff.firstName,
    lastName: staff.lastName,
    displayName: staff.displayName,
    email: staff.email ?? "",
    phone: staff.phone ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      callUpdate({
        data: {
          staffId: staff.id,
          firstName: form.firstName,
          lastName: form.lastName,
          displayName: form.displayName,
          email: form.email || null,
          phone: form.phone || null,
        },
      }),
    onSuccess: async () => {
      setMsg("Gespeichert.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <form
      className="max-w-lg space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        mutation.mutate();
      }}
    >
      <TextField
        label="Vorname"
        value={form.firstName}
        onChange={(v) => setForm({ ...form, firstName: v })}
        required
      />
      <TextField
        label="Nachname"
        value={form.lastName}
        onChange={(v) => setForm({ ...form, lastName: v })}
        required
      />
      <TextField
        label="Anzeigename"
        value={form.displayName}
        onChange={(v) => setForm({ ...form, displayName: v })}
        required
      />
      <TextField
        label="E-Mail"
        value={form.email}
        onChange={(v) => setForm({ ...form, email: v })}
        type="email"
      />
      <TextField
        label="Telefon"
        value={form.phone}
        onChange={(v) => setForm({ ...form, phone: v })}
      />
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {mutation.isPending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}

function LocationsTab({ staffId, current }: { staffId: string; current: string[] }) {
  const queryClient = useQueryClient();
  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
  });
  const callAssign = useServerFn(assignStaffLocations);
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const [msg, setMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => callAssign({ data: { staffId, locationIds: Array.from(selected) } }),
    onSuccess: async () => {
      setMsg("Gespeichert.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="max-w-lg space-y-3">
      {locationsQ.isLoading && <p className="text-sm text-muted-foreground">Lade Standorte…</p>}
      {locationsQ.data && locationsQ.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine Standorte angelegt.</p>
      )}
      <div className="space-y-2">
        {locationsQ.data?.map((loc) => (
          <label key={loc.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(loc.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(loc.id);
                else next.delete(loc.id);
                setSelected(next);
              }}
            />
            <span className="text-foreground">{loc.name}</span>
          </label>
        ))}
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <button
        onClick={() => {
          setMsg(null);
          mutation.mutate();
        }}
        disabled={mutation.isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {mutation.isPending ? "Speichern…" : "Speichern"}
      </button>
    </div>
  );
}

function RoleTab({
  staff,
}: {
  staff: { id: string; role: "admin" | "manager" | "staff" | "payroll" | null; isActive: boolean };
}) {
  const queryClient = useQueryClient();
  const callSetRole = useServerFn(setStaffRole);
  const callSetActive = useServerFn(setStaffActive);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
  };

  const roleMutation = useMutation({
    mutationFn: (role: "admin" | "manager" | "staff" | "payroll" | null) =>
      callSetRole({ data: { staffId: staff.id, role } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const activeMutation = useMutation({
    mutationFn: (isActive: boolean) => callSetActive({ data: { staffId: staff.id, isActive } }),
    onSuccess: refresh,
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Rolle</div>
        <div className="flex flex-wrap gap-2">
          {(["admin", "manager", "staff", "payroll", null] as const).map((r) => (
            <button
              key={r ?? "none"}
              onClick={() => {
                setMsg(null);
                roleMutation.mutate(r);
              }}
              disabled={roleMutation.isPending}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                staff.role === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-foreground hover:bg-accent"
              }`}
            >
              {r === "payroll" ? "Lohnbüro" : (r ?? "Keine")}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Status</div>
        <button
          onClick={() => {
            setMsg(null);
            activeMutation.mutate(!staff.isActive);
          }}
          disabled={activeMutation.isPending}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          {staff.isActive ? "Deaktivieren" : "Aktivieren"}
        </button>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
    </div>
  );
}

function PinTab({ staffId, hasPin }: { staffId: string; hasPin: boolean }) {
  const queryClient = useQueryClient();
  const callSetPin = useServerFn(setPin);
  const callClearPin = useServerFn(clearPin);
  const [pin, setPinVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const setMut = useMutation({
    mutationFn: () => callSetPin({ data: { staffId, pin } }),
    onSuccess: async () => {
      setPinVal("");
      setMsg("PIN gesetzt.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const clearMut = useMutation({
    mutationFn: () => callClearPin({ data: { staffId } }),
    onSuccess: async () => {
      setMsg("PIN entfernt.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-muted-foreground">
        Aktueller Status: {hasPin ? "PIN ist gesetzt" : "kein PIN gesetzt"}
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setMut.mutate();
        }}
      >
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Neuer PIN (4–8 Ziffern)</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4,8}"
            required
            value={pin}
            onChange={(e) => setPinVal(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={setMut.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            PIN setzen
          </button>
          {hasPin && (
            <button
              type="button"
              onClick={() => {
                setMsg(null);
                clearMut.mutate();
              }}
              disabled={clearMut.isPending}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              PIN entfernen
            </button>
          )}
        </div>
      </form>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}

function BadgesTab({ staffId }: { staffId: string }) {
  const queryClient = useQueryClient();
  const badgesQ = useQuery({
    queryKey: ["admin", "badges", staffId],
    queryFn: () => listBadges({ data: { staffId } }),
  });
  const callIssue = useServerFn(issueBadge);
  const callRevoke = useServerFn(revokeBadge);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const issueMut = useMutation({
    mutationFn: () => callIssue({ data: { staffId } }),
    onSuccess: async ({ token }) => {
      setNewToken(token);
      setMsg(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "badges", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });
  const revokeMut = useMutation({
    mutationFn: (tokenId: string) => callRevoke({ data: { tokenId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "badges", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <button
        onClick={() => issueMut.mutate()}
        disabled={issueMut.isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {issueMut.isPending ? "Erstellen…" : "Neues Badge ausstellen"}
      </button>

      {newToken && (
        <div className="rounded-md border border-primary bg-primary/5 p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Neuer Badge-Token (wird nur EINMAL angezeigt)
          </div>
          <code className="mt-1 block break-all text-sm text-foreground">{newToken}</code>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Schließen
          </button>
        </div>
      )}

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {badgesQ.data && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Erstellt</th>
                <th className="px-3 py-2 font-medium">Läuft ab</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {badgesQ.data.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {b.expiresAt ? new Date(b.expiresAt).toLocaleString("de-DE") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {b.revokedAt ? (
                      <span className="text-muted-foreground">widerrufen</span>
                    ) : (
                      <span className="text-foreground">aktiv</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!b.revokedAt && (
                      <button
                        onClick={() => revokeMut.mutate(b.id)}
                        disabled={revokeMut.isPending}
                        className="text-sm text-destructive hover:underline"
                      >
                        Widerrufen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {badgesQ.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    Noch keine Badges.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
