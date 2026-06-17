// Pathless Layout-Route — alle Routen unterhalb von _authenticated/
// erfordern eine Supabase-Session. Nicht angemeldete Nutzer werden zu
// /auth umgeleitet.
//
// ssr:false, weil Supabase die Session in localStorage hält und der
// Server sie bei Hard-Refresh nicht sehen kann.

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession() liest die Session lokal aus localStorage – kein Netz-Roundtrip
    // an /auth/v1/user. Server-Functions revalidieren das Bearer-Token via
    // requireSupabaseAuth ohnehin pro Aufruf.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) throw redirect({ to: "/auth" });

    // Erst-Login-Flow: wenn must_change_password=true gesetzt ist, darf
    // der Mitarbeiter ausschließlich die Passwort-Wechsel-Seite erreichen.
    const identity = await getMyIdentity();
    if (
      identity.mustChangePassword &&
      location.pathname !== "/passwort-aendern"
    ) {
      throw redirect({ to: "/passwort-aendern" });
    }
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});
