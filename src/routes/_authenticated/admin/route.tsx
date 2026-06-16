// Admin-Layout (B1c). Gate: nur Mitarbeiter mit Rolle manager+ dürfen die
// /admin/*-Seiten betreten. Unzureichende Rolle → redirect("/").
//
// Schreibende Aktionen prüfen die Rolle nochmals serverseitig (admin) —
// dieses Gate ist nur UX, nicht die Sicherheitsbarriere.

import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";
import { BrandLockup } from "@/components/brand-lockup";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) throw redirect({ to: "/auth" });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });

    const identity = await getMyIdentity();
    if (identity.role !== "admin" && identity.role !== "manager" && identity.role !== "payroll") {
      throw redirect({ to: "/" });
    }
    // Lohnbüro darf NUR die Zeitübersicht sehen.
    if (identity.role === "payroll" && location.pathname !== "/admin/zeit-uebersicht") {
      throw redirect({ to: "/admin/zeit-uebersicht" });
    }
    return { identity };
  },
  component: AdminLayout,
});

type Role = "admin" | "manager" | "payroll";

type SubItem = { to: string; label: string };
type Group = {
  key: string;
  label: string;
  default: string;
  prefixes: string[];
  sub: SubItem[];
  roles?: Role[]; // omitted = admin + manager
  muted?: boolean;
};

const GROUPS: Group[] = [
  {
    key: "personal",
    label: "Mitarbeiter",
    default: "/admin/staff",
    prefixes: ["/admin/staff", "/admin/dienstplan", "/admin/zeit-uebersicht"],
    sub: [
      { to: "/admin/staff", label: "Mitarbeiter" },
      { to: "/admin/dienstplan", label: "Dienstplan" },
      { to: "/admin/zeit-uebersicht", label: "Zeitübersicht" },
    ],
  },
  {
    key: "kasse",
    label: "Kasse",
    default: "/admin/kasse",
    prefixes: ["/admin/kasse", "/admin/kasse-saldo"],
    sub: [
      { to: "/admin/kasse", label: "Tagesabschlüsse" },
      { to: "/admin/kasse-saldo", label: "Saldo" },
    ],
  },
  {
    key: "bestellung",
    label: "Bestellung",
    default: "/admin/bestellung",
    prefixes: ["/admin/bestellung"],
    sub: [], // eigene Sub-Nav lebt in bestellung.tsx
  },
  {
    key: "stammdaten",
    label: "Stammdaten",
    default: "/admin/locations",
    prefixes: ["/admin/locations"],
    sub: [{ to: "/admin/locations", label: "Standorte" }],
  },
  {
    key: "system",
    label: "System",
    default: "/admin/migration",
    prefixes: ["/admin/migration", "/admin/import-zuordnungen"],
    sub: [
      { to: "/admin/migration", label: "Migration" },
      { to: "/admin/import-zuordnungen", label: "Zuordnungen" },
    ],
    roles: ["admin"],
    muted: true,
  },
];

function matchPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function AdminLayout() {
  const { identity } = Route.useRouteContext();
  const isPayroll = identity.role === "payroll";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = identity.role as Role;
  const visibleGroups = GROUPS.filter((g) => !g.roles || g.roles.includes(role));
  const activeGroup = visibleGroups.find((g) => matchPrefix(pathname, g.prefixes));
  // Sub-Nav für „Bestellung" wird in bestellung.tsx selbst gerendert.
  const showSub = activeGroup && activeGroup.sub.length > 0;
  const primaryGroups = visibleGroups.filter((g) => !g.muted);
  const systemGroups = visibleGroups.filter((g) => g.muted);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 pt-3">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <Link to="/" aria-label="COCO Startseite">
                <BrandLockup size="sm" />
              </Link>
              <span className="text-border" aria-hidden>
                /
              </span>
              <Link to="/admin" className="text-sm font-semibold text-foreground">
                Verwaltung
              </Link>
            </div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Zurück
            </Link>
          </div>
          {isPayroll ? (
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-1 text-sm">
              <Link
                to="/admin/zeit-uebersicht"
                className="-mb-px border-b-2 border-foreground pb-2 text-foreground"
              >
                Zeitübersicht
              </Link>
            </nav>
          ) : (
            <>
              <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-1 text-sm">
                {primaryGroups.map((g) => {
                  const active = activeGroup?.key === g.key;
                  return (
                    <Link
                      key={g.key}
                      to={g.default}
                      className={
                        active
                          ? "-mb-px border-b-2 border-foreground pb-2 text-foreground"
                          : "-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                      }
                    >
                      {g.label}
                    </Link>
                  );
                })}
                {systemGroups.length > 0 && (
                  <>
                    <span className="text-border" aria-hidden>
                      ·
                    </span>
                    {systemGroups.map((g) => {
                      const active = activeGroup?.key === g.key;
                      return (
                        <Link
                          key={g.key}
                          to={g.default}
                          className={
                            active
                              ? "-mb-px border-b-2 border-foreground pb-2 text-foreground"
                              : "-mb-px border-b-2 border-transparent pb-2 text-muted-foreground/70 transition-colors hover:text-foreground"
                          }
                        >
                          {g.label}
                        </Link>
                      );
                    })}
                  </>
                )}
              </nav>
              {showSub && (
                <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 py-2 text-xs">
                  {activeGroup!.sub.map((s) => {
                    const active = pathname === s.to || pathname.startsWith(s.to + "/");
                    return (
                      <Link
                        key={s.to}
                        to={s.to}
                        className={
                          active
                            ? "font-medium text-foreground"
                            : "text-muted-foreground transition-colors hover:text-foreground"
                        }
                      >
                        {s.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
