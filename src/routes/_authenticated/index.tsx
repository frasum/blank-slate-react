import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Betriebsplattform" },
      { name: "description", content: "Vereinte Gastronomie-Betriebsplattform" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, identity, identityLoading, signOut } = useAuth();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Betriebsplattform</h1>
        <p className="text-sm text-muted-foreground">Angemeldet als {session?.user.email}</p>
        <div className="text-sm text-muted-foreground">
          {identityLoading
            ? "Identität wird geladen…"
            : identity?.staffId
              ? `Mitarbeiter ${identity.staffId.slice(0, 8)} · Rolle ${identity.role ?? "—"}`
              : "Kein Mitarbeiter verknüpft"}
        </div>
        <button
          onClick={() => void signOut()}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Abmelden
        </button>
      </div>
    </main>
  );
}
