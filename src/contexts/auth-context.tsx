// AuthContext (B1b): bündelt Supabase-Session + Identität (staff_id, role)
// für die UI. Identität wird per geschützter Server-Function aus user_links
// und role_assignments geholt.
//
// Der Provider wird in __root.tsx eingehängt. Bei Anmeldung/Abmeldung
// werden Identitäts-Queries automatisch invalidiert.

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";
import { AuthContext, type AuthContextValue } from "./auth-context-types";
import { setSentryContext } from "@/lib/monitoring/sentry-client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(newSession);
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      } else {
        queryClient.invalidateQueries({ queryKey: ["identity"] });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const identityQuery = useQuery({
    queryKey: ["identity", session?.user.id ?? null],
    queryFn: () => getMyIdentity(),
    enabled: !!session,
    staleTime: 60_000,
  });

  // P2 — Sentry-Kontext (org_id, role, user.id) an die laufende Session
  // koppeln. Sign-out löscht den Kontext, damit Fehler-Cluster keine alten
  // Tags erben.
  useEffect(() => {
    const identity = identityQuery.data;
    if (!session || !identity) {
      setSentryContext(null);
      return;
    }
    setSentryContext({
      userId: session.user.id,
      staffId: identity.staffId,
      orgId: identity.organizationId,
      role: identity.role,
      impersonating: identity.impersonation.active,
    });
  }, [session, identityQuery.data]);

  const value: AuthContextValue = {
    session,
    loading,
    identity: identityQuery.data ?? null,
    identityLoading: identityQuery.isLoading,
    signOut: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      await router.navigate({ to: "/auth", replace: true });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
