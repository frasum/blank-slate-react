import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Identity } from "@/lib/auth/me.functions";

export type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  identity: Identity | null;
  identityLoading: boolean;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
