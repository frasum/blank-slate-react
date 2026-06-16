// Admin-Layout (B1c). Gate: nur Mitarbeiter mit Rolle manager+ dürfen die
// /admin/*-Seiten betreten. Unzureichende Rolle → redirect("/").
//
// Schreibende Aktionen prüfen die Rolle nochmals serverseitig (admin) —
// dieses Gate ist nur UX, nicht die Sicherheitsbarriere.

import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
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

function AdminLayout() {
  const { identity } = Route.useRouteContext();
  const isPayroll = identity.role === "payroll";
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
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-1 text-sm">
              {!isPayroll && (
                <Link
                  to="/admin/staff"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Mitarbeiter
                </Link>
              )}
              <Link
                to="/admin/zeit-uebersicht"
                className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
              >
                Zeitübersicht
              </Link>
              {!isPayroll && (
                <Link
                  to="/admin/dienstplan"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Dienstplan
                </Link>
              )}
              {!isPayroll && (
                <Link
                  to="/admin/kasse"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Kasse
                </Link>
              )}
              {!isPayroll && (
                <Link
                  to="/admin/kasse-saldo"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Kassensaldo
                </Link>
              )}
              {!isPayroll && (
                <Link
                  to="/admin/bestellung"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Bestellung
                </Link>
              )}
              {!isPayroll && (
                <Link
                  to="/admin/locations"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Standorte
                </Link>
              )}
              {identity.role === "admin" && (
                <Link
                  to="/admin/migration"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Migration
                </Link>
              )}
              {identity.role === "admin" && (
                <Link
                  to="/admin/import-zuordnungen"
                  className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "-mb-px border-b-2 border-foreground pb-2 text-foreground" }}
                >
                  Zuordnungen
                </Link>
              )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
