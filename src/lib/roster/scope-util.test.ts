import { describe, it, expect } from "vitest";
import {
  allowedLocations,
  canEditScope,
  resolvePlanerScope,
  scopeIncludes,
  assertScopeNotEmpty,
  type RosterScope,
} from "./scope-util";
import { ForbiddenError } from "@/lib/admin/role-guard";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppPermission } from "@/lib/admin/permissions-catalog";

const L1 = "11111111-1111-1111-1111-111111111111";
const L2 = "22222222-2222-2222-2222-222222222222";
const L3 = "33333333-3333-3333-3333-333333333333";
const locs = [{ id: L1 }, { id: L2 }, { id: L3 }];

describe("allowedLocations", () => {
  it("filtert auf Standorte aus den Scopes", () => {
    const scopes: RosterScope[] = [
      { locationId: L1, area: "kitchen" },
      { locationId: L3, area: "service" },
    ];
    expect(allowedLocations(locs, scopes).map((l) => l.id)).toEqual([L1, L3]);
  });
  it("leere Scopes → leere Liste", () => {
    expect(allowedLocations(locs, [])).toEqual([]);
  });
  it("Manager-Fall (alle Kombis) → alle Standorte", () => {
    const scopes: RosterScope[] = locs.flatMap((l) => [
      { locationId: l.id, area: "kitchen" as const },
      { locationId: l.id, area: "service" as const },
    ]);
    expect(allowedLocations(locs, scopes).map((l) => l.id)).toEqual([L1, L2, L3]);
  });
});

describe("canEditScope", () => {
  const scopes: RosterScope[] = [{ locationId: L1, area: "kitchen" }];
  it("(L1,kitchen) erlaubt → true", () => {
    expect(canEditScope(scopes, L1, "kitchen")).toBe(true);
  });
  it("(L1,service) → false", () => {
    expect(canEditScope(scopes, L1, "service")).toBe(false);
  });
  it("(L2,kitchen) → false", () => {
    expect(canEditScope(scopes, L2, "kitchen")).toBe(false);
  });
  it("locationId=null → false", () => {
    expect(canEditScope(scopes, null, "kitchen")).toBe(false);
  });
});

// PL1 — Fakes für resolvePlanerScope. Der Helfer nutzt nur zwei APIs:
// supabase.rpc('has_permission', …) und supabaseAdmin.from('locations').select().eq()

type RpcCall = { _perm: AppPermission; _location?: string; _area?: string };

function makeSupabase(rules: (call: RpcCall) => boolean): SupabaseClient<Database> {
  return {
    rpc: async (_fn: string, args: RpcCall) => ({ data: rules(args), error: null }),
  } as unknown as SupabaseClient<Database>;
}

function makeAdmin(locIds: string[]): SupabaseClient<Database> {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: async () => ({ data: locIds.map((id) => ({ id })), error: null }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

const ORG = "org-1";

describe("resolvePlanerScope", () => {
  it("manager (globales Default) → { all: true }", async () => {
    const supabase = makeSupabase(() => true); // has_permission liefert immer true
    const admin = makeAdmin([L1, L2]);
    const scope = await resolvePlanerScope(supabase, admin, ORG, "roster.leave.view_all");
    expect(scope).toEqual({ all: true });
  });

  it("planer mit einem allow-Override → nur diese Kombi", async () => {
    const supabase = makeSupabase((c) => {
      if (!c._location) return false; // kein Default
      return c._location === L1 && c._area === "kitchen";
    });
    const admin = makeAdmin([L1, L2]);
    const scope = await resolvePlanerScope(supabase, admin, ORG, "roster.leave.view_all");
    expect(scope).toEqual({
      all: false,
      combos: [{ locationId: L1, area: "kitchen" }],
    });
  });

  it("planer ohne jede Freigabe → leere combos", async () => {
    const supabase = makeSupabase(() => false);
    const admin = makeAdmin([L1, L2]);
    const scope = await resolvePlanerScope(supabase, admin, ORG, "roster.leave.view_all");
    expect(scope).toEqual({ all: false, combos: [] });
  });
});

describe("scopeIncludes", () => {
  it("all=true → immer true", () => {
    expect(scopeIncludes({ all: true }, L1, "kitchen")).toBe(true);
    expect(scopeIncludes({ all: true }, L2, "service")).toBe(true);
  });
  it("all=false → nur Treffer in combos", () => {
    const scope = {
      all: false as const,
      combos: [{ locationId: L1, area: "kitchen" as const }],
    };
    expect(scopeIncludes(scope, L1, "kitchen")).toBe(true);
    expect(scopeIncludes(scope, L1, "service")).toBe(false);
    expect(scopeIncludes(scope, L2, "kitchen")).toBe(false);
  });
});

describe("assertScopeNotEmpty", () => {
  it("all=true → kein Throw", () => {
    expect(() => assertScopeNotEmpty({ all: true }, "roster.leave.view_all")).not.toThrow();
  });
  it("combos nicht leer → kein Throw", () => {
    expect(() =>
      assertScopeNotEmpty(
        { all: false, combos: [{ locationId: L1, area: "kitchen" }] },
        "roster.leave.view_all",
      ),
    ).not.toThrow();
  });
  it("all=false, combos=[] → ForbiddenError", () => {
    expect(() => assertScopeNotEmpty({ all: false, combos: [] }, "roster.leave.view_all")).toThrow(
      ForbiddenError,
    );
  });
});
