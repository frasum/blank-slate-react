import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  clearPermissionOverride,
  getStaffPermissions,
  setPermissionOverride,
} from "@/lib/admin/permissions.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  PERMISSION_CATALOG,
  MODULE_LABEL,
  type AppPermission,
  type PermissionEffect,
  type PermissionMeta,
  type PermissionModule,
} from "@/lib/admin/permissions-catalog";
import type { StaffDepartment } from "@/lib/staff-domain";

type Cell = "default" | "allow" | "deny";
type AreaScope = "all" | StaffDepartment;

export function PermissionsTab({ staffId }: { staffId: string }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<string>("global"); // "global" oder location.id
  const [areaScope, setAreaScope] = useState<AreaScope>("all");

  const permsQ = useQuery({
    queryKey: ["admin", "permissions", staffId],
    queryFn: () => getStaffPermissions({ data: { staffId } }),
  });
  const locsQ = useQuery({
    queryKey: ["admin", "locations"],
    queryFn: () => listLocations(),
  });

  const setFn = useServerFn(setPermissionOverride);
  const clearFn = useServerFn(clearPermissionOverride);

  const setMut = useMutation({
    mutationFn: (input: {
      permission: AppPermission;
      effect: PermissionEffect;
      locationId: string | null;
      area: StaffDepartment | null;
    }) => setFn({ data: { staffId, ...input } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "permissions", staffId] }),
  });
  const clearMut = useMutation({
    mutationFn: (input: {
      permission: AppPermission;
      locationId: string | null;
      area: StaffDepartment | null;
    }) => clearFn({ data: { staffId, ...input } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "permissions", staffId] }),
  });

  const scopedLocation: string | null = scope === "global" ? null : scope;
  const scopedArea: StaffDepartment | null = areaScope === "all" ? null : areaScope;

  const overrideMap = useMemo(() => {
    const m = new Map<string, PermissionEffect>();
    if (!permsQ.data) return m;
    for (const o of permsQ.data.overrides) {
      const key = `${o.permission}::${o.locationId ?? "null"}::${o.area ?? "null"}`;
      m.set(key, o.effect);
    }
    return m;
  }, [permsQ.data]);

  const defaultSet = useMemo(() => new Set(permsQ.data?.defaults ?? []), [permsQ.data?.defaults]);

  // Nach Modul gruppieren (Reihenfolge wie im Katalog sichtbar machen).
  const grouped = useMemo(() => {
    const order: PermissionModule[] = [
      "kasse",
      "zeit",
      "dienstplan",
      "lohn",
      "aufgaben",
      "verkaufsartikel",
    ];
    const map = new Map<PermissionModule, PermissionMeta[]>();
    for (const m of order) map.set(m, []);
    for (const p of PERMISSION_CATALOG) {
      const arr = map.get(p.module) ?? [];
      arr.push(p);
      map.set(p.module, arr);
    }
    return order
      .map((m) => ({ module: m, items: map.get(m) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, []);

  if (permsQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (permsQ.error || !permsQ.data)
    return <p className="text-sm text-destructive">Rechte konnten nicht geladen werden.</p>;

  const isAdminRole = permsQ.data.role === "admin";

  function cellState(perm: AppPermission): Cell {
    const key = `${perm}::${scopedLocation ?? "null"}::${scopedArea ?? "null"}`;
    const ov = overrideMap.get(key);
    if (ov === "allow") return "allow";
    if (ov === "deny") return "deny";
    return "default";
  }

  function effectiveBadge(perm: AppPermission): { text: string; cls: string } {
    if (isAdminRole) return { text: "ja (Admin)", cls: "bg-emerald-500/15 text-emerald-700" };
    const a = scopedArea ?? "null";
    const loc = scopedLocation ?? "null";
    const candidates = [
      `${perm}::null::null`,
      `${perm}::null::${a}`,
      `${perm}::${loc}::null`,
      `${perm}::${loc}::${a}`,
    ];
    const effects = candidates.map((k) => overrideMap.get(k));
    if (effects.includes("deny")) return { text: "nein", cls: "bg-rose-500/15 text-rose-700" };
    if (effects.includes("allow")) return { text: "ja", cls: "bg-emerald-500/15 text-emerald-700" };
    const def = defaultSet.has(perm);
    return def
      ? { text: "ja (Default)", cls: "bg-emerald-500/10 text-emerald-700" }
      : { text: "nein (Default)", cls: "bg-muted text-muted-foreground" };
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">
          Rolle: <span className="font-medium text-foreground">{permsQ.data.role ?? "—"}</span>
          {isAdminRole && (
            <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700">
              Admins ignorieren Overrides
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">Geltungsbereich:</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="global">Global (alle Standorte)</option>
          {(locsQ.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label className="ml-2 text-xs font-medium text-muted-foreground">Bereich:</label>
        <select
          value={areaScope}
          onChange={(e) => setAreaScope(e.target.value as AreaScope)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="all">Alle Bereiche</option>
          <option value="kitchen">Küche</option>
          <option value="service">Service</option>
          <option value="gl">GL</option>
        </select>
      </div>

      {grouped.map((g) => (
        <div key={g.module} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{MODULE_LABEL[g.module]}</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Recht</th>
                  <th className="px-3 py-2 text-left">Effektiv</th>
                  <th className="px-3 py-2 text-left">
                    Override für {scope === "global" ? "global" : "diesen Standort"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((p) => {
                  const eff = effectiveBadge(p.key);
                  const state = cellState(p.key);
                  const disabled = isAdminRole || setMut.isPending || clearMut.isPending;
                  const scopeDisabled = scope !== "global" && !p.scopable;
                  return (
                    <tr key={p.key} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                        <div className="mt-0.5 text-[10px] font-mono text-muted-foreground/70">
                          {p.key}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${eff.cls}`}>
                          {eff.text}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {scopeDisabled ? (
                          <span className="text-xs text-muted-foreground">
                            nicht standortspezifisch
                          </span>
                        ) : (
                          <div className="inline-flex overflow-hidden rounded-md border border-input">
                            {(
                              [
                                ["default", "Default"],
                                ["allow", "Erlauben"],
                                ["deny", "Verbieten"],
                              ] as [Cell, string][]
                            ).map(([val, label]) => {
                              const active = state === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (val === "default") {
                                      clearMut.mutate({
                                        permission: p.key,
                                        locationId: scopedLocation,
                                        area: scopedArea,
                                      });
                                    } else {
                                      setMut.mutate({
                                        permission: p.key,
                                        effect: val,
                                        locationId: scopedLocation,
                                        area: scopedArea,
                                      });
                                    }
                                  }}
                                  className={`px-2.5 py-1 text-xs ${
                                    active
                                      ? val === "allow"
                                        ? "bg-emerald-500/20 text-emerald-700"
                                        : val === "deny"
                                          ? "bg-rose-500/20 text-rose-700"
                                          : "bg-muted text-foreground"
                                      : "bg-background hover:bg-muted/60"
                                  } disabled:opacity-50`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {(setMut.error || clearMut.error) && (
        <p className="text-sm text-destructive">
          {(setMut.error as Error | undefined)?.message ??
            (clearMut.error as Error | undefined)?.message}
        </p>
      )}
    </div>
  );
}
