import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePortalNav } from "@/lib/nav/portal-nav";

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
  const { items } = usePortalNav();
  const baseBtn =
    "inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const secondaryBtn = `${baseBtn} border border-input bg-card text-foreground hover:bg-accent`;
  const visible = items.filter((i) => i.to !== "/");
  return (
    <div className="flex items-center justify-center py-6">
      <div className="w-full max-w-sm space-y-8">
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
          {visible.map((item) => (
            <Link key={item.to} to={item.to} className={secondaryBtn}>
              {item.label}
            </Link>
          ))}
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
    </div>
  );
}
