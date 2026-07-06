// P-3b — Reine, I/O-freie Ableitungen aus den Roster-Scopes des Aufrufers.
// scopes stammen aus getMyRosterScopes (siehe roster.functions.ts).
//
// PL1 — `resolvePlanerScope` extrahiert das gemeinsame Muster für Rechte, die
// admin/manager global (permission_role_defaults) und planer nur gescoped
// (permission_overrides mit location + area) haben. Konsumenten: Dienstplan
// (getMyRosterScopes), Urlaubsanträge, Schichttausch, Jahresplaner.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppPermission } from "@/lib/admin/permissions-catalog";
import { ForbiddenError } from "@/lib/admin/role-guard";

export type RosterScope = { locationId: string; area: "kitchen" | "service" };

// Standorte, in denen der Aufrufer mindestens EINEN Bereich planen darf.
export function allowedLocations<T extends { id: string }>(
  locations: T[],
  scopes: RosterScope[],
): T[] {
  const ids = new Set(scopes.map((s) => s.locationId));
  return locations.filter((l) => ids.has(l.id));
}

// Darf der Aufrufer im konkreten (Standort, Bereich) schreiben?
export function canEditScope(
  scopes: RosterScope[],
  locationId: string | null,
  area: "kitchen" | "service",
): boolean {
  if (!locationId) return false;
  return scopes.some((s) => s.locationId === locationId && s.area === area);
}

// PL1 — Aufgelöster Scope: `all=true` heißt „darf alle Standorte × Bereiche"
// (admin/manager mit Default), sonst die konkret freigegebenen Kombinationen.
export type ResolvedScope = { all: true } | { all: false; combos: RosterScope[] };

/**
 * Löst den effektiven Scope des aktuellen Aufrufers für ein gegebenes Recht
 * auf. Nutzt den benutzerbezogenen Supabase-Client für `has_permission`
 * (Impersonation greift dort), und den Admin-Client für die Standort-Liste.
 *
 * 1. `has_permission(perm, null, null)` == true ⇒ globales Recht ⇒ `{all:true}`.
 * 2. Sonst: alle Standorte der Org × {kitchen, service} durchprüfen und die
 *    positiven Kombinationen einsammeln.
 */
export async function resolvePlanerScope(
  supabase: SupabaseClient<Database>,
  supabaseAdmin: SupabaseClient<Database>,
  organizationId: string,
  permission: AppPermission,
): Promise<ResolvedScope> {
  const { data: globalOk } = await supabase.rpc("has_permission", {
    _perm: permission,
  });
  if (globalOk === true) return { all: true };

  const { data: locs, error } = await supabaseAdmin
    // ST1: bewusst ungefiltert — Daten-Zugriff (Scope-Auflösung braucht alle Standorte).
    .from("locations")
    .select("id")
    .eq("organization_id", organizationId);
  if (error) throw error;
  const areas: RosterScope["area"][] = ["kitchen", "service"];
  const combos = (locs ?? []).flatMap((l) =>
    areas.map((a) => ({ locationId: l.id as string, area: a })),
  );
  const checks = await Promise.all(
    combos.map(async (c) => {
      const { data: allowed } = await supabase.rpc("has_permission", {
        _perm: permission,
        _location: c.locationId,
        _area: c.area,
      });
      return allowed === true ? c : null;
    }),
  );
  return { all: false, combos: checks.filter((x): x is RosterScope => x !== null) };
}

/**
 * Prüft, ob eine konkrete (locationId, area)-Kombination innerhalb des
 * aufgelösten Scopes liegt. `all=true` ⇒ immer true.
 */
export function scopeIncludes(
  scope: ResolvedScope,
  locationId: string,
  area: "kitchen" | "service",
): boolean {
  if (scope.all) return true;
  return scope.combos.some((c) => c.locationId === locationId && c.area === area);
}

// PL2 — Wirft, wenn der Aufrufer WEDER global berechtigt ist noch irgendeine
// gescopte Freigabe hat. Ersetzt globale assertPermission-Vorab-Checks
// vor resolvePlanerScope, die für planer-Rollen ohne Rollen-Default
// fälschlich Forbidden liefern (has_permission ohne _location/_area matcht
// nur Overrides mit location_id IS NULL).
export function assertScopeNotEmpty(scope: ResolvedScope, permission: string): void {
  if (!scope.all && scope.combos.length === 0) {
    throw new ForbiddenError(`Fehlende Berechtigung: ${permission}`);
  }
}
