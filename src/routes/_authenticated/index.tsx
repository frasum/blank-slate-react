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
  const role = identity?.role;
  const canAdmin = role === "admin" || role === "manager";
  const isPayroll = role === "payroll";
  const isStaff = role === "staff";
  const baseBtn =
    "inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const primaryBtn = `${baseBtn} bg-primary text-primary-foreground hover:bg-primary/90`;
  const secondaryBtn = `${baseBtn} border border-input bg-card text-foreground hover:bg-accent`;

  type Item = { to: string; label: string; roles: Array<"admin" | "manager" | "payroll" | "staff"> };
  const items: Array<Item> = [
    { to: "/admin", label: "Admin", roles: ["admin", "manager"] },
    { to: "/admin/zeit-uebersicht", label: "Arbeitszeiten", roles: ["admin", "manager", "payroll"] },
    { to: "/admin/bestellung", label: "Bestellungen/Inventur", roles: ["admin", "manager"] },
    { to: "/admin/dienstplan", label: "Dienstplan", roles: ["admin", "manager"] },
    { to: "/zeit/abrechnung", label: "Kellner-Abrechnung", roles: ["admin", "manager", "staff"] },
    { to: "/zeit", label: "Stempeluhr", roles: ["admin", "manager", "staff"] },
    { to: "/admin/kasse", label: "Tagesabrechnung", roles: ["admin", "manager"] },
  ];
  const visible = items
    .filter((i) => (role ? i.roles.includes(role as "admin" | "manager" | "payroll" | "staff") : false))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
  void canAdmin; void isPayroll; void isStaff;
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
          {visible.map((item) => (
            <Link key={item.to} to={item.to} className={item.primary ? primaryBtn : secondaryBtn}>
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
    </main>
  );
}
