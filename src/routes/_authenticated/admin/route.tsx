// Admin-Layout (B1c). Gate: nur Mitarbeiter mit Rolle manager+ dürfen die
// /admin/*-Seiten betreten. Unzureichende Rolle → redirect("/").
//
// Schreibende Aktionen prüfen die Rolle nochmals serverseitig (admin) —
// dieses Gate ist nur UX, nicht die Sicherheitsbarriere.

import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) throw redirect({ to: "/auth" });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });

    const identity = await getMyIdentity();
    if (identity.role !== "admin" && identity.role !== "manager") {
      throw redirect({ to: "/" });
    }
    return { identity };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { identity } = Route.useRouteContext();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="text-sm font-semibold text-foreground">
              Verwaltung
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                to="/admin/staff"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                Mitarbeiter
              </Link>
              <Link
                to="/admin/zeit"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                Zeit
              </Link>
              <Link
                to="/admin/kasse"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                Kasse
              </Link>
              <Link
                to="/admin/kasse-saldo"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                Kassensaldo
              </Link>
              <Link
                to="/admin/locations"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                Standorte
              </Link>
              {identity.role === "admin" && (
                <Link
                  to="/admin/migration"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-foreground" }}
                >
                  Migration
                </Link>
              )}
              {identity.role === "admin" && (
                <Link
                  to="/admin/import-zuordnungen"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-foreground" }}
                >
                  Zuordnungen
                </Link>
              )}
            </nav>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Zurück
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
