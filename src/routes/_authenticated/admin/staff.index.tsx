import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listStaff, setStaffRole, setStaffLocationDepartment } from "@/lib/admin/staff.functions";
import { assignStaffSkills, listSkills, type SkillCategory } from "@/lib/admin/skills.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  distinctDepartments,
  ineligibleSkills,
  isSkillCategoryEligible,
  type StaffDepartment,
} from "@/lib/admin/skill-eligibility";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AppRole } from "@/lib/admin/role-guard";

export const Route = createFileRoute("/_authenticated/admin/staff/")({
  head: () => ({ meta: [{ title: "Mitarbeiter · Verwaltung" }] }),
  component: StaffListPage,
});

const ROLE_OPTIONS: { value: AppRole | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "payroll", label: "Payroll" },
  { value: "staff", label: "Staff" },
];

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Geschäftsleitung",
  other: "Sonstiges",
};
const CATEGORY_ORDER: SkillCategory[] = ["kitchen", "service", "gl", "other"];

const DEPARTMENT_ORDER: StaffDepartment[] = ["service", "kitchen", "gl"];
const DEPARTMENT_SHORT: Record<StaffDepartment, string> = {
  service: "S",
  kitchen: "K",
  gl: "GL",
};
const DEPARTMENT_LABEL: Record<StaffDepartment, string> = {
  service: "Service",
  kitchen: "Küche",
  gl: "Geschäftsleitung",
};

function StaffListPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const isAdmin = identity.role === "admin";
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => listStaff(),
  });
  const skillsQ = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => listSkills(),
    enabled: isAdmin,
  });
  const locationsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
    enabled: isAdmin,
  });
  const locationNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locationsQ.data ?? []) m.set(l.id, l.name);
    return m;
  }, [locationsQ.data]);
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return data;
    return showInactive ? data : data.filter((s) => s.isActive);
  }, [data, showInactive]);
  const inactiveCount = useMemo(() => (data ? data.filter((s) => !s.isActive).length : 0), [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mitarbeiter</h1>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Inaktive anzeigen
            {inactiveCount > 0 && (
              <span className="text-xs text-muted-foreground">({inactiveCount})</span>
            )}
          </label>
          <Link
            to="/admin/staff/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Neuer Mitarbeiter
          </Link>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {error && <p className="text-sm text-destructive">Fehler beim Laden.</p>}

      {filtered && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
                <th className="px-3 py-2 font-medium">Abteilungen</th>
                <th className="px-3 py-2 font-medium">Skills</th>
                <th className="px-3 py-2 font-medium">PIN</th>
                <th className="px-3 py-2 font-medium">Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t border-border ${!s.isActive ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/staff/$staffId"
                      params={{ staffId: s.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {s.displayName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{s.email ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <RoleCell staffId={s.id} role={s.role} />
                    ) : (
                      <span className="text-muted-foreground">{s.role ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <DepartmentsCell
                        staffId={s.id}
                        locationIds={s.locationIds}
                        locationDepartments={s.locationDepartments}
                        heldSkills={s.skillIds
                          .map((id) => (skillsQ.data ?? []).find((sk) => sk.id === id))
                          .filter(
                            (sk): sk is NonNullable<typeof sk> => sk !== undefined,
                          )
                          .map((sk) => ({ id: sk.id, name: sk.name, category: sk.category }))}
                        locationNameById={locationNameById}
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {s.departments.length > 0
                          ? s.departments.map((d) => DEPARTMENT_SHORT[d]).join(" · ")
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <SkillsCell
                        staffId={s.id}
                        currentSkillIds={s.skillIds}
                        allSkills={skillsQ.data ?? []}
                        departments={s.departments}
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {s.skillIds.length > 0 ? `${s.skillIds.length} Skills` : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.hasPin ? "gesetzt" : "—"}</td>
                  <td className="px-3 py-2">
                    {s.isActive ? (
                      <span className="text-foreground">aktiv</span>
                    ) : (
                      <span className="text-muted-foreground">inaktiv</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                    {data && data.length > 0
                      ? 'Keine aktiven Mitarbeiter. Aktiviere „Inaktive anzeigen".'
                      : "Noch keine Mitarbeiter."}
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

function RoleCell({ staffId, role }: { staffId: string; role: AppRole | null }) {
  const queryClient = useQueryClient();
  const callSetRole = useServerFn(setStaffRole);
  const mutation = useMutation({
    mutationFn: (next: AppRole | null) => callSetRole({ data: { staffId, role: next } }),
    onSuccess: async () => {
      toast.success("Rolle gespeichert.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });
  return (
    <select
      className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-50"
      value={role ?? ""}
      disabled={mutation.isPending}
      onChange={(e) => {
        const v = e.target.value;
        mutation.mutate(v === "" ? null : (v as AppRole));
      }}
      aria-label="Rolle"
    >
      {ROLE_OPTIONS.map((o) => (
        <option key={o.value || "none"} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type SkillRow = { id: string; name: string; category: SkillCategory };

function SkillsCell({
  staffId,
  currentSkillIds,
  allSkills,
}: {
  staffId: string;
  currentSkillIds: string[];
  allSkills: SkillRow[];
}) {
  const queryClient = useQueryClient();
  const callAssign = useServerFn(assignStaffSkills);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentSkillIds));

  // Re-sync when popover opens (in case data changed)
  function onOpenChange(next: boolean) {
    if (next) setSelected(new Set(currentSkillIds));
    setOpen(next);
  }

  const mutation = useMutation({
    mutationFn: (ids: string[]) => callAssign({ data: { staffId, skillIds: ids } }),
    onSuccess: async () => {
      toast.success("Skills gespeichert.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });

  const grouped = useMemo(() => {
    const m = new Map<SkillCategory, SkillRow[]>();
    for (const s of allSkills) {
      const list = m.get(s.category) ?? [];
      list.push(s);
      m.set(s.category, list);
    }
    return m;
  }, [allSkills]);

  const count = currentSkillIds.length;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger className="rounded-md border border-input bg-background px-2 py-1 text-sm hover:bg-muted">
        {count === 0 ? "Skills zuweisen" : `${count} ${count === 1 ? "Skill" : "Skills"}`}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        {allSkills.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Skills angelegt.</p>
        )}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[cat]}
              </p>
              <div className="space-y-1">
                {items.map((sk) => {
                  const checked = selected.has(sk.id);
                  return (
                    <label
                      key={sk.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(selected);
                          if (checked) next.delete(sk.id);
                          else next.add(sk.id);
                          setSelected(next);
                        }}
                      />
                      {sk.name}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={mutation.isPending || allSkills.length === 0}
            onClick={() => mutation.mutate(Array.from(selected))}
          >
            Speichern
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
