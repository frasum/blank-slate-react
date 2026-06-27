// Pathless Layout-Route — alle Routen unterhalb von _authenticated/
// erfordern eine Supabase-Session. Nicht angemeldete Nutzer werden zu
// /auth umgeleitet.
//
// ssr:false, weil Supabase die Session in localStorage hält und der
// Server sie bei Hard-Refresh nicht sehen kann.

import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { PortalShell } from "@/components/portal/PortalShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    // getSession() liest die Session lokal aus localStorage – kein Netz-Roundtrip
    // an /auth/v1/user. Server-Functions revalidieren das Bearer-Token via
    // requireSupabaseAuth ohnehin pro Aufruf.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) throw redirect({ to: "/auth" });

    // Erst-Login-Flow: wenn must_change_password=true gesetzt ist, darf
    // der Mitarbeiter ausschließlich die Passwort-Wechsel-Seite erreichen.
    // Identity über den gemeinsamen Query-Cache (gleicher Key wie AuthContext)
    // → ein Roundtrip pro Session statt pro Navigation.
    const identity = await context.queryClient.ensureQueryData({
      queryKey: ["identity", data.session.user.id ?? null],
      queryFn: () => getMyIdentity(),
    });
    if (identity.mustChangePassword && location.pathname !== "/passwort-aendern") {
      throw redirect({ to: "/passwort-aendern" });
    }
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <>
      <ImpersonationBanner />
      {inAdmin ? (
        <Outlet />
      ) : (
        <PortalShell>
          <Outlet />
        </PortalShell>
      )}
    </>
  );
}
