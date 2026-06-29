// Admin-Layout (B1c). Gate: nur Mitarbeiter mit Rolle manager+ dürfen die
// /admin/*-Seiten betreten. Unzureichende Rolle → redirect("/").
//
// Schreibende Aktionen prüfen die Rolle nochmals serverseitig (admin) —
// dieses Gate ist nur UX, nicht die Sicherheitsbarriere.

import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { tabClass } from "@/components/ui/nav-tab";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context, location }) => {
    // Session-Check rein lokal (kein /auth/v1/user-Roundtrip); getMyIdentity()
    // revalidiert das Token serverseitig via requireSupabaseAuth.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) throw redirect({ to: "/auth" });

    // Identity über den gemeinsamen Query-Cache (gleicher Key wie AuthContext)
    // → ein Roundtrip pro Session statt pro Admin-Navigation.
    const identity = await context.queryClient.ensureQueryData({
      queryKey: ["identity", sessionData.session.user.id ?? null],
      queryFn: () => getMyIdentity(),
    });
    if (identity.role !== "admin" && identity.role !== "manager" && identity.role !== "payroll") {
      throw redirect({ to: "/" });
    }
    // Lohnbüro darf NUR die Arbeitszeiten sehen.
    if (identity.role === "payroll" && location.pathname !== "/admin/zeit-uebersicht") {
      throw redirect({ to: "/admin/zeit-uebersicht" });
    }
    return { identity };
  },
  component: AdminLayout,
});

type Role = "admin" | "manager" | "payroll";

type SubItem = { to: string; label: string; roles?: Role[] };
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
    prefixes: [
      "/admin/staff",
      "/admin/dienstplan",
      "/admin/zeit-uebersicht",
      "/admin/lohnrechner",
      "/admin/lohn-verteilung",
      "/admin/urlaub",
    ],
    sub: [
      { to: "/admin/staff", label: "Mitarbeiter" },
      { to: "/admin/dienstplan", label: "Dienstplan" },
      { to: "/admin/urlaub", label: "Urlaubsanträge" },
      { to: "/admin/zeit-uebersicht", label: "Arbeitszeiten" },
      { to: "/admin/lohnrechner", label: "Lohnrechner", roles: ["admin"] },
      { to: "/admin/lohn-verteilung", label: "Lohn-Verteilung", roles: ["admin"] },
    ],
  },
  {
    key: "kasse",
    label: "Kasse",
    default: "/admin/kasse",
    prefixes: ["/admin/kasse", "/admin/kasse-saldo", "/admin/trinkgeld-rest"],
    sub: [
      { to: "/admin/kasse", label: "Tagesabschlüsse" },
      { to: "/admin/kasse-saldo", label: "Saldo" },
      { to: "/admin/trinkgeld-rest", label: "Trinkgeld-Rest", roles: ["admin"] },
    ],
  },
  {
    key: "bestellung",
    label: "Bestellung/Inventur",
    default: "/admin/bestellung",
    prefixes: ["/admin/bestellung"],
    sub: [], // eigene Sub-Nav lebt in bestellung.tsx
  },
  {
    key: "aufgaben",
    label: "Aufgaben",
    default: "/admin/aufgaben",
    prefixes: ["/admin/aufgaben"],
    sub: [{ to: "/admin/aufgaben", label: "Kanban-Board" }],
  },
  {
    key: "stammdaten",
    label: "Stammdaten",
    default: "/admin/locations",
    prefixes: ["/admin/locations"],
    sub: [{ to: "/admin/locations", label: "Standorte" }],
  },
  {
    key: "statistik",
    label: "Statistik",
    default: "/admin/statistik",
    prefixes: ["/admin/statistik"],
    sub: [{ to: "/admin/statistik", label: "Umsatz" }],
  },
  {
    key: "einstellungen",
    label: "Einstellungen",
    default: "/admin/einstellungen",
    prefixes: ["/admin/einstellungen"],
    sub: [{ to: "/admin/einstellungen", label: "Organisation" }],
    roles: ["admin"],
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
        <div className="mx-auto max-w-7xl px-6 pt-3">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <Link to="/" aria-label="COCO Startseite">
                <span className="text-sm font-semibold text-foreground">COCO</span>
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
            <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pb-0 text-sm">
              <Link to="/admin/zeit-uebersicht" className={tabClass(true)}>
                Arbeitszeiten
              </Link>
            </nav>
          ) : (
            <>
              <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 text-sm">
                {primaryGroups.map((g) => {
                  const active = activeGroup?.key === g.key;
                  return (
                    <Link key={g.key} to={g.default} className={tabClass(active)}>
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
                        <Link key={g.key} to={g.default} className={tabClass(active)}>
                          {g.label}
                        </Link>
                      );
                    })}
                  </>
                )}
              </nav>
              {showSub && (
                <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pt-2 text-xs">
                  {activeGroup!.sub
                    .filter((s) => !s.roles || s.roles.includes(role))
                    .map((s) => {
                      const active = pathname === s.to || pathname.startsWith(s.to + "/");
                      return (
                        <Link key={s.to} to={s.to} className={tabClass(active)}>
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
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
