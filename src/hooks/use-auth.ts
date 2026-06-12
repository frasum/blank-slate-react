import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context-types";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden");
  return ctx;
}
