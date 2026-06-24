import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listStaff,
  setStaffActive,
  setStaffRole,
  setStaffLocationDepartment,
} from "@/lib/admin/staff.functions";
import { assignStaffSkills, listSkills, type SkillCategory } from "@/lib/admin/skills.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  distinctDepartments,
  ineligibleSkills,
  isSkillCategoryEligible,
  type StaffDepartment,
} from "@/lib/admin/skill-eligibility";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, UserCheck, UserMinus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
const DEPARTMENT_ACTIVE_CLASS: Record<StaffDepartment, string> = {
  service: "border-dept-service bg-dept-service text-dept-service-foreground",
  kitchen: "border-dept-kitchen bg-dept-kitchen text-dept-kitchen-foreground",
  gl: "border-dept-gl bg-dept-gl text-dept-gl-foreground",
};

type StaffRow = NonNullable<Awaited<ReturnType<typeof listStaff>>>[number];
type SkillRow = Awaited<ReturnType<typeof listSkills>>[number];
type LocationRow = Awaited<ReturnType<typeof listLocations>>[number];

type DeptFilter = "all" | "service" | "kitchen";

function StaffListPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const isAdmin = identity.role === "admin";
  const queryClient = useQueryClient();

  const staffQ = useQuery({ queryKey: ["admin", "staff"], queryFn: () => listStaff() });
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

  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [deptTab, setDeptTab] = useState<DeptFilter>("all");

  const data = useMemo(() => staffQ.data ?? [], [staffQ.data]);
  const skills = useMemo(() => skillsQ.data ?? [], [skillsQ.data]);
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const activeCount = useMemo(() => data.filter((s) => s.isActive).length, [data]);
  const inactiveCount = useMemo(() => data.filter((s) => !s.isActive).length, [data]);
  const serviceCount = useMemo(
    () => data.filter((s) => s.isActive && s.departments.includes("service")).length,
    [data],
  );
  const kitchenCount = useMemo(
    () => data.filter((s) => s.isActive && s.departments.includes("kitchen")).length,
    [data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((s) => showInactive || s.isActive)
      .filter((s) => {
        if (deptTab === "all") return true;
        return s.departments.includes(deptTab);
      })
      .filter((s) => {
        if (!q) return true;
        const name = s.displayName?.toLowerCase() ?? "";
        const email = s.email?.toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      })
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data, showInactive, deptTab, search]);

  // --- Server-Function calls (Logik unverändert) ---
  const callSetDept = useServerFn(setStaffLocationDepartment);
  const callAssignSkills = useServerFn(assignStaffSkills);
  const callSetActive = useServerFn(setStaffActive);

  const deptMutation = useMutation({
    mutationFn: (v: {
      staffId: string;
      locationId: string;
      department: StaffDepartment;
      enabled: boolean;
    }) =>
      callSetDept({
        data: {
          staffId: v.staffId,
          locationId: v.locationId,
          department: v.department,
          enabled: v.enabled,
        },
      }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "staff"] });
      const previous = queryClient.getQueryData(["admin", "staff"]);
      queryClient.setQueryData<unknown>(["admin", "staff"], (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return (old as StaffRow[]).map((row) => {
          if (row.id !== v.staffId) return row;
          const has = row.locationDepartments.some(
            (r) => r.locationId === v.locationId && r.department === v.department,
          );
          const nextLD = v.enabled
            ? has
              ? row.locationDepartments
              : [...row.locationDepartments, { locationId: v.locationId, department: v.department }]
            : row.locationDepartments.filter(
                (r) => !(r.locationId === v.locationId && r.department === v.department),
              );
          return {
            ...row,
            locationDepartments: nextLD,
            departments: distinctDepartments(nextLD),
          };
        });
      });
      return { previous };
    },
    onError: (err: unknown, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["admin", "staff"], ctx.previous);
      }
      toast.error(err instanceof Error ? err.message : "Fehler.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
  });

  const skillMutation = useMutation({
    mutationFn: (v: { staffId: string; skillIds: string[] }) =>
      callAssignSkills({ data: { staffId: v.staffId, skillIds: v.skillIds } }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "staff"] });
      const previous = queryClient.getQueryData(["admin", "staff"]);
      queryClient.setQueryData<unknown>(["admin", "staff"], (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return (old as StaffRow[]).map((row) =>
          row.id === v.staffId ? { ...row, skillIds: v.skillIds } : row,
        );
      });
      return { previous };
    },
    onError: (err: unknown, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["admin", "staff"], ctx.previous);
      }
      toast.error(err instanceof Error ? err.message : "Fehler.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
  });

  const activeMutation = useMutation({
    mutationFn: (v: { staffId: string; isActive: boolean }) =>
      callSetActive({ data: { staffId: v.staffId, isActive: v.isActive } }),
    onSuccess: async (_r, v) => {
      toast.success(v.isActive ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler."),
  });

  function toggleDept(
    staffId: string,
    locationId: string,
    department: StaffDepartment,
    active: boolean,
  ) {
    deptMutation.mutate({ staffId, locationId, department, enabled: !active });
  }

  function toggleSkill(staffId: string, skillId: string, has: boolean, currentIds: string[]) {
    const next = has ? currentIds.filter((id) => id !== skillId) : [...currentIds, skillId];
    skillMutation.mutate({ staffId, skillIds: next });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold lg:text-3xl">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                Mitarbeiterverwaltung
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeCount} Mitarbeiter · {serviceCount} Service · {kitchenCount} Küche
                {inactiveCount > 0 && (
                  <span className="text-muted-foreground/60"> · {inactiveCount} inaktiv</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/admin/staff/new"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Neuer Mitarbeiter
              </Link>
            </div>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen…"
              className="pl-8"
              aria-label="Mitarbeiter suchen"
            />
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={deptTab} onValueChange={(v) => setDeptTab(v as DeptFilter)}>
              <TabsList>
                <TabsTrigger value="all">Alle ({activeCount})</TabsTrigger>
                <TabsTrigger value="service">Service ({serviceCount})</TabsTrigger>
                <TabsTrigger value="kitchen">Küche ({kitchenCount})</TabsTrigger>
              </TabsList>
            </Tabs>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Inaktive
              {inactiveCount > 0 && (
                <span className="text-xs text-muted-foreground">({inactiveCount})</span>
              )}
            </label>
          </div>
        </div>

        {staffQ.isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
        {staffQ.error && <p className="text-sm text-destructive">Fehler beim Laden.</p>}

        {/* Matrix */}
        {!staffQ.isLoading && !staffQ.error && (
          <Card className="overflow-hidden">
            <div className="relative overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 min-w-[180px] bg-muted">
                      Name
                    </TableHead>
                    <TableHead className="min-w-[120px]">Berechtigung</TableHead>
                    {locations.map((loc) => (
                      <TableHead key={loc.id} className="min-w-[120px] text-center">
                        <div className="font-medium text-foreground">{loc.name}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Abteilung
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[260px]">Skills</TableHead>
                    <TableHead className="min-w-[70px] text-center">PIN</TableHead>
                    <TableHead className="min-w-[80px] text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <StaffMatrixRow
                      key={s.id}
                      staff={s}
                      locations={locations}
                      skills={skills}
                      isAdmin={isAdmin}
                      deptPending={deptMutation.isPending}
                      skillPending={skillMutation.isPending}
                      activePending={activeMutation.isPending}
                      onToggleDept={toggleDept}
                      onToggleSkill={toggleSkill}
                      onToggleActive={(staffId, isActive) =>
                        activeMutation.mutate({ staffId, isActive })
                      }
                    />
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4 + locations.length}
                        className="py-8 text-center text-muted-foreground"
                      >
                        {data.length > 0 ? "Keine Treffer." : "Noch keine Mitarbeiter."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

function StaffMatrixRow({
  staff,
  locations,
  skills,
  isAdmin,
  deptPending,
  skillPending,
  activePending,
  onToggleDept,
  onToggleSkill,
  onToggleActive,
}: {
  staff: StaffRow;
  locations: LocationRow[];
  skills: SkillRow[];
  isAdmin: boolean;
  deptPending: boolean;
  skillPending: boolean;
  activePending: boolean;
  onToggleDept: (
    staffId: string,
    locationId: string,
    department: StaffDepartment,
    active: boolean,
  ) => void;
  onToggleSkill: (staffId: string, skillId: string, has: boolean, currentIds: string[]) => void;
  onToggleActive: (staffId: string, isActive: boolean) => void;
}) {
  const heldSkills = useMemo(
    () =>
      staff.skillIds
        .map((id) => skills.find((sk) => sk.id === id))
        .filter((sk): sk is SkillRow => sk !== undefined)
        .map((sk) => ({ id: sk.id, name: sk.name, category: sk.category })),
    [staff.skillIds, skills],
  );

  const isPayroll = staff.role === "payroll";
  const visibleSkills = useMemo(
    () =>
      skills.filter(
        (sk) =>
          (sk.category !== "other" && staff.departments.includes(sk.category as StaffDepartment)) ||
          staff.skillIds.includes(sk.id),
      ),
    [skills, staff.departments, staff.skillIds],
  );

  return (
    <TableRow className={cn("group", !staff.isActive && "opacity-50")}>
      {/* Name (sticky) */}
      <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/50">
        <Link
          to="/admin/staff/$staffId"
          params={{ staffId: staff.id }}
          className="font-medium text-foreground hover:underline"
        >
          {staff.displayName}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {[staff.firstName, staff.lastName].filter(Boolean).join(" ") || "—"}
          </span>
          {!staff.isActive && (
            <Badge variant="outline" className="text-[10px]">
              Inaktiv
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Berechtigung */}
      <TableCell>
        {isAdmin ? (
          <RoleCell staffId={staff.id} role={staff.role} />
        ) : (
          <span className="text-muted-foreground">{staff.role ?? "—"}</span>
        )}
      </TableCell>

      {/* Eine Spalte pro Standort */}
      {locations.map((loc) => (
        <TableCell key={loc.id} className="py-2 text-center">
          {isPayroll ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex items-center justify-center gap-1">
              {DEPARTMENT_ORDER.map((dept) => {
                const active = staff.locationDepartments.some(
                  (ld) => ld.locationId === loc.id && ld.department === dept,
                );
                const rowsAfter = staff.locationDepartments.filter(
                  (ld) => !(ld.locationId === loc.id && ld.department === dept),
                );
                const blocking = active
                  ? ineligibleSkills(heldSkills, distinctDepartments(rowsAfter))
                  : [];
                const disabled = !isAdmin || deptPending || (active && blocking.length > 0);
                const tooltip =
                  active && blocking.length > 0
                    ? `Benötigt von Skill: ${blocking.map((b) => b.name).join(", ")}`
                    : active
                      ? `${DEPARTMENT_LABEL[dept]} entfernen`
                      : `${DEPARTMENT_LABEL[dept]} zuweisen`;
                return (
                  <Tooltip key={dept}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        aria-label={`${loc.name} · ${DEPARTMENT_LABEL[dept]}`}
                        disabled={disabled}
                        onClick={() => onToggleDept(staff.id, loc.id, dept, active)}
                        className={cn(
                          "inline-flex h-7 min-w-[28px] items-center justify-center rounded-md border px-1.5 text-[11px] font-bold transition-all",
                          active
                            ? `${DEPARTMENT_ACTIVE_CLASS[dept]} shadow-sm`
                            : "border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          disabled && "cursor-not-allowed",
                          disabled && !active && "opacity-40",
                        )}
                      >
                        {DEPARTMENT_SHORT[dept]}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </TableCell>
      ))}

      {/* Skill-Chips */}
      <TableCell>
        {isPayroll ? (
          <span className="text-xs text-muted-foreground">Lohnbüro – keine Bereiche/Skills</span>
        ) : isAdmin ? (
          <div className="flex flex-wrap gap-1">
            {skills.length === 0 && (
              <span className="text-xs text-muted-foreground">Keine Skills angelegt.</span>
            )}
            {skills.length > 0 && visibleSkills.length === 0 && (
              <span className="text-xs text-muted-foreground">Keine passende Abteilung.</span>
            )}
            {visibleSkills.map((skill) => {
              const has = staff.skillIds.includes(skill.id);
              const eligible = isSkillCategoryEligible(skill.category, staff.departments);
              const disabled = !isAdmin || skillPending || (!eligible && !has);
              const tooltip =
                !eligible && !has
                  ? `Erst Abteilung „${CATEGORY_LABEL[skill.category]}“ zuweisen`
                  : has
                    ? `${skill.name} entfernen`
                    : `${skill.name} zuweisen`;
              const color = skill.color ?? undefined;
              return (
                <Tooltip key={skill.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggleSkill(staff.id, skill.id, has, staff.skillIds)}
                      className={cn(
                        "inline-flex min-w-[36px] items-center justify-center rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-all",
                        !eligible && !has && "cursor-not-allowed opacity-25",
                        eligible && !disabled && "cursor-pointer hover:scale-105",
                        !eligible && has && "opacity-70",
                      )}
                      style={
                        color
                          ? has
                            ? { backgroundColor: color, borderColor: color, color: "#fff" }
                            : { borderColor: color, color }
                          : undefined
                      }
                    >
                      {skill.name}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <span className="text-muted-foreground">
            {staff.skillIds.length > 0 ? `${staff.skillIds.length} Skills` : "—"}
          </span>
        )}
      </TableCell>

      {/* PIN */}
      <TableCell className="text-center text-muted-foreground">
        {staff.hasPin ? "gesetzt" : "—"}
      </TableCell>

      {/* Aktionen */}
      <TableCell className="text-right">
        {isAdmin ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={activePending}
                onClick={() => onToggleActive(staff.id, !staff.isActive)}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                  "opacity-0 group-hover:opacity-100",
                )}
                aria-label={staff.isActive ? "Deaktivieren" : "Reaktivieren"}
              >
                {staff.isActive ? (
                  <UserMinus className="h-4 w-4" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {staff.isActive ? "Mitarbeiter deaktivieren" : "Mitarbeiter reaktivieren"}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </TableCell>
    </TableRow>
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
