// Pathless Layout-Route — alle Routen unterhalb von _authenticated/
// erfordern eine Supabase-Session. Nicht angemeldete Nutzer werden zu
// /auth umgeleitet.
//
// ssr:false, weil Supabase die Session in localStorage hält und der
// Server sie bei Hard-Refresh nicht sehen kann.

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
