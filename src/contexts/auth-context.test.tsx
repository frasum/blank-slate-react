// Regressionstest für Logout-Reihenfolge (siehe §85):
// supabase.auth.signOut() MUSS vor router.navigate("/auth") laufen,
// sonst entsteht durch die gegenläufigen beforeLoad-Guards in
// /auth ↔ /_authenticated eine Redirect-Schleife
// ("Maximum call stack size exceeded").

import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useContext } from "react";
import { QueryClient } from "@tanstack/react-query";

const calls: string[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(async () => {
        calls.push("signOut");
      }),
    },
  },
}));

vi.mock("@/lib/auth/me.functions", () => ({
  getMyIdentity: vi.fn(async () => null),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: vi.fn(async () => {
      calls.push("navigate");
    }),
  }),
}));

import { AuthProvider } from "./auth-context";
import { AuthContext } from "./auth-context-types";
import { QueryClientProvider } from "@tanstack/react-query";

describe("AuthProvider.signOut", () => {
  it("beendet die Supabase-Session VOR der Navigation nach /auth", async () => {
    calls.length = 0;
    const qc = new QueryClient();
    let signOut: (() => Promise<void>) | null = null;
    function Grab() {
      const ctx = useContext(AuthContext);
      signOut = ctx?.signOut ?? null;
      return null;
    }
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Grab />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(signOut).toBeTypeOf("function"));
    await act(async () => {
      await signOut!();
    });
    expect(calls).toEqual(["signOut", "navigate"]);
  });
});