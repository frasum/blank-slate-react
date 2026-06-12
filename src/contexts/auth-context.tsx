// AuthContext (B1b): bündelt Supabase-Session + Identität (staff_id, role)
// für die UI. Identität wird per geschützter Server-Function aus user_links
// und role_assignments geholt.
//
// Der Provider wird in __root.tsx eingehängt. Bei Anmeldung/Abmeldung
// werden Identitäts-Queries automatisch invalidiert.

import { createContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity, type Identity } from "@/lib/auth/me.functions";

export type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  identity: Identity | null;
  identityLoading: boolean;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

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

  const value: AuthContextValue = {
    session,
    loading,
    identity: identityQuery.data ?? null,
    identityLoading: identityQuery.isLoading,
    signOut: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
