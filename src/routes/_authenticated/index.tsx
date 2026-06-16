import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { BrandLockup } from "@/components/brand-lockup";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "COCO – Central Operations Cockpit" },
      { name: "description", content: "COCO · Central Operations Cockpit" },
    ],
  }),
  component: Index,
});

function Index() {
  const { identity, identityLoading, signOut } = useAuth();
  const canAdmin = identity?.role === "admin" || identity?.role === "manager";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <BrandLockup size="lg" />
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            {identityLoading
              ? "Identität wird geladen…"
              : identity?.staffId
                ? `${identity.displayName ?? identity.staffId.slice(0, 8)} · ${identity.role ?? "—"}`
                : "Kein Mitarbeiter verknüpft"}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            to="/zeit"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Stempeluhr
          </Link>
          <Link
            to="/zeit/abrechnung"
            className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Kellner-Abrechnung
          </Link>
          {canAdmin && (
            <>
              <Link
                to="/admin/dienstplan"
                className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Dienstplan
              </Link>
              <Link
                to="/admin/zeit-uebersicht"
                className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Arbeitszeiten
              </Link>
              <Link
                to="/admin/kasse"
                className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Tagesabrechnung
              </Link>
              <Link
                to="/admin/bestellung"
                className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Bestellungen
              </Link>
              <Link
                to="/admin"
                className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Zur Verwaltung
              </Link>
            </>
          )}
        </div>
        <div className="flex justify-center pt-2">
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Abmelden
          </button>
        </div>
      </div>
    </main>
  );
}
