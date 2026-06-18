import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  assignStaffLocations,
  getStaff,
  setStaffActive,
  setStaffRole,
  setStaffParticipatesInPool,
  updateStaffBasics,
} from "@/lib/admin/staff.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { clearPin, setPin } from "@/lib/admin/pin.functions";
import {
  createStaffAccount,
  getStaffAccountStatus,
  resetStaffPassword,
} from "@/lib/admin/account.functions";
import {
  assignStaffSkills,
  getStaffSkills,
  listSkills,
  type SkillCategory,
} from "@/lib/admin/skills.functions";
import { TabButton } from "@/components/ui/nav-tab";
import { PersonalDetailsTab } from "@/components/admin/PersonalDetailsTab";
import { PermissionsTab } from "@/components/admin/PermissionsTab";

export const Route = createFileRoute("/_authenticated/admin/staff/$staffId")({
  head: () => ({ meta: [{ title: "Mitarbeiter · Verwaltung" }] }),
  component: StaffDetailPage,
});

type Tab =
  | "basics"
  | "locations"
  | "skills"
  | "personal"
  | "role"
  | "pin"
  | "account"
  | "permissions";

function StaffDetailPage() {
  const { staffId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("basics");
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const showPersonal = identity.role === "admin" || identity.role === "payroll";
  const canEditPersonal = identity.role === "admin";
  const isAdmin = identity.role === "admin";

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

      <div
        role="tablist"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border"
      >
        {(
          [
            ["basics", "Stammdaten"],
            ["locations", "Standorte"],
            ["skills", "Skills"],
            ...(showPersonal ? ([["personal", "Personaldaten"]] as [Tab, string][]) : []),
            ["role", "Rolle & Aktiv"],
            ["pin", "PIN"],
            ...(isAdmin ? ([["account", "Login"]] as [Tab, string][]) : []),
            ...(isAdmin ? ([["permissions", "Rechte"]] as [Tab, string][]) : []),
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <TabButton key={k} active={tab === k} onClick={() => setTab(k)}>
            {label}
          </TabButton>
        ))}
      </div>

      {tab === "basics" && <BasicsTab staff={s} />}
      {tab === "locations" && <LocationsTab staffId={s.id} current={s.locationIds} />}
      {tab === "skills" && <SkillsTab staffId={s.id} />}
      {tab === "personal" && showPersonal && (
        <PersonalDetailsTab staffId={s.id} canEdit={canEditPersonal} />
      )}
      {tab === "role" && <RoleTab staff={s} />}
      {tab === "pin" && <PinTab staffId={s.id} hasPin={s.hasPin} />}
      {tab === "account" && isAdmin && <AccountTab staffId={s.id} staffEmail={s.email} />}
      {tab === "permissions" && isAdmin && <PermissionsTab staffId={s.id} />}
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
    participatesInPool: boolean;
  };
}) {
  const queryClient = useQueryClient();
  const callUpdate = useServerFn(updateStaffBasics);
  const callSetPool = useServerFn(setStaffParticipatesInPool);
  const [form, setForm] = useState({
    firstName: staff.firstName,
    lastName: staff.lastName,
    displayName: staff.displayName,
    email: staff.email ?? "",
    phone: staff.phone ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [poolMsg, setPoolMsg] = useState<string | null>(null);

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

  const poolMutation = useMutation({
    mutationFn: (participates: boolean) =>
      callSetPool({ data: { staffId: staff.id, participates } }),
    onSuccess: async () => {
      setPoolMsg("Gespeichert.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setPoolMsg(e instanceof Error ? e.message : "Fehler."),
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
      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={staff.participatesInPool}
            disabled={poolMutation.isPending}
            onChange={(e) => {
              setPoolMsg(null);
              poolMutation.mutate(e.target.checked);
            }}
            className="mt-0.5"
          />
          <span>
            <span className="text-foreground">Am Trinkgeldpool teilnehmen</span>
            <span className="block text-xs text-muted-foreground">
              Deaktivieren schließt diesen Mitarbeiter aus Küchen- und Service-Pool aus.
              Geschäftsleitung ist strukturell ausgeschlossen.
            </span>
          </span>
        </label>
        {poolMsg && <p className="text-xs text-muted-foreground">{poolMsg}</p>}
      </div>
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

type SkillRow = {
  id: string;
  name: string;
  category: SkillCategory;
  color: string | null;
  sortOrder: number;
};

function SkillsTab({ staffId }: { staffId: string }) {
  const queryClient = useQueryClient();
  const skillsQ = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => listSkills(),
  });
  const currentQ = useQuery({
    queryKey: ["admin", "staff-skills", staffId],
    queryFn: () => getStaffSkills({ data: { staffId } }),
  });
  const callAssign = useServerFn(assignStaffSkills);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (selected === null && currentQ.data) {
      setSelected(new Set(currentQ.data));
    }
  }, [currentQ.data, selected]);

  const mutation = useMutation({
    mutationFn: () =>
      callAssign({ data: { staffId, skillIds: Array.from(selected ?? new Set<string>()) } }),
    onSuccess: async () => {
      setMsg("Gespeichert.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff-skills", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  const categoryLabel: Record<SkillCategory, string> = {
    kitchen: "Küche",
    service: "Service",
    gl: "Geschäftsleitung",
    other: "Sonstiges",
  };
  const categoryOrder: SkillCategory[] = ["kitchen", "service", "gl", "other"];
  const grouped = useMemo(() => {
    const m = new Map<SkillCategory, SkillRow[]>();
    for (const s of skillsQ.data ?? []) {
      const list = m.get(s.category) ?? [];
      list.push(s);
      m.set(s.category, list);
    }
    return m;
  }, [skillsQ.data]);

  if (skillsQ.isLoading || currentQ.isLoading || !selected) {
    return <p className="text-sm text-muted-foreground">Lade…</p>;
  }

  const totalSelected = selected.size;

  return (
    <div className="max-w-2xl space-y-6">
      {skillsQ.data && skillsQ.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine Skills angelegt.</p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalSelected} {totalSelected === 1 ? "Skill" : "Skills"} ausgewählt
        </p>
      </div>
      {categoryOrder.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;
        const catSelected = items.filter((i) => selected.has(i.id)).length;
        return (
          <section key={cat} className="rounded-lg border border-border bg-card/40 p-4">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {categoryLabel[cat]}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {catSelected}/{items.length}
              </span>
            </header>
            <div className="flex flex-wrap gap-2">
              {items.map((sk) => {
                const active = selected.has(sk.id);
                return (
                  <button
                    type="button"
                    key={sk.id}
                    onClick={() => {
                      const next = new Set(selected);
                      if (active) next.delete(sk.id);
                      else next.add(sk.id);
                      setSelected(next);
                    }}
                    aria-pressed={active}
                    className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`inline-block h-2.5 w-2.5 rounded-full border ${active ? "border-foreground/20" : "border-border"}`}
                      style={{ backgroundColor: sk.color ?? "transparent" }}
                    />
                    <span className="font-medium">{sk.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
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

function AccountTab({ staffId, staffEmail }: { staffId: string; staffEmail: string | null }) {
  const queryClient = useQueryClient();
  const statusQ = useQuery({
    queryKey: ["admin", "account", staffId],
    queryFn: () => getStaffAccountStatus({ data: { staffId } }),
  });
  const callCreate = useServerFn(createStaffAccount);
  const callReset = useServerFn(resetStaffPassword);

  const [email, setEmail] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Vorbelegung des E-Mail-Feldes mit der Stammdaten-E-Mail.
  useEffect(() => {
    if (staffEmail && !email) setEmail(staffEmail);
  }, [staffEmail, email]);

  const createMut = useMutation({
    mutationFn: () => callCreate({ data: { staffId, email: email.trim() } }),
    onSuccess: async (res) => {
      setGenerated(res.password);
      setGeneratedEmail(res.email);
      setErr(null);
      setMsg(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "account", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Fehler."),
  });

  const resetMut = useMutation({
    mutationFn: () => callReset({ data: { staffId } }),
    onSuccess: async (res) => {
      setGenerated(res.password);
      setGeneratedEmail(statusQ.data?.email ?? null);
      setErr(null);
      setMsg(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "account", staffId] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Fehler."),
  });

  if (statusQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  const status = statusQ.data;

  return (
    <div className="max-w-lg space-y-4">
      {generated && (
        <div className="rounded-md border border-primary bg-primary/5 p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Standardpasswort (wird nur EINMAL angezeigt — bitte sofort weitergeben)
          </div>
          {generatedEmail && (
            <div className="mt-1 text-xs text-muted-foreground">
              E-Mail: <span className="text-foreground">{generatedEmail}</span>
            </div>
          )}
          <code className="mt-1 block break-all text-base text-foreground">{generated}</code>
          <p className="mt-2 text-xs text-muted-foreground">
            Der Mitarbeiter muss beim nächsten Login ein eigenes Passwort vergeben.
          </p>
          <button
            type="button"
            onClick={() => {
              setGenerated(null);
              setGeneratedEmail(null);
            }}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Schließen
          </button>
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {status?.hasAccount ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Login-E-Mail</div>
            <div className="text-sm text-foreground">{status.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Status</div>
            <div className="text-sm text-foreground">
              {status.mustChangePassword
                ? "Standardpasswort gesetzt — Mitarbeiter muss beim nächsten Login wechseln."
                : "Eigenes Passwort gesetzt."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setErr(null);
              resetMut.mutate();
            }}
            disabled={resetMut.isPending}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {resetMut.isPending ? "Setze zurück…" : "Passwort zurücksetzen"}
          </button>
        </div>
      ) : (
        <form
          className="space-y-3 rounded-md border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            if (!email.trim()) {
              setErr("Bitte E-Mail eingeben.");
              return;
            }
            createMut.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Dieser Mitarbeiter hat noch kein Konto. Bei Mitarbeitern ohne eigene E-Mail
            kann eine Pseudo-Adresse vergeben werden (z. B. <code>vorname@coco.local</code>).
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Login-E-Mail</span>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? "Erstelle…" : "Konto anlegen & Standardpasswort erzeugen"}
          </button>
        </form>
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
