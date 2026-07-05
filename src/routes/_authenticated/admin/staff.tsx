import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  // SD1 — Personalverwaltung nur noch für admin + payroll.
  // Manager, die die URL direkt aufrufen, werden auf /admin (Standard-Landing)
  // umgeleitet; die eigentliche Sicherheitsbarriere sitzt im Server-Guard.
  beforeLoad: async ({ context }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return;
    const identity = await context.queryClient.ensureQueryData({
      queryKey: ["identity", sessionData.session.user.id ?? null],
      queryFn: () => getMyIdentity(),
    });
    if (identity.role !== "admin" && identity.role !== "payroll") {
      throw redirect({ to: "/admin" });
    }
  },
  component: () => <Outlet />,
});
