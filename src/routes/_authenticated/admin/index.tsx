import { createFileRoute, Link } from "@tanstack/react-router";
import { getMyIdentity } from "@/lib/auth/me.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Verwaltung" }] }),
  loader: () => getMyIdentity(),
  component: AdminIndex,
});

type Card = {
  to: string;
  title: string;
  items: string;
  adminOnly?: boolean;
  muted?: boolean;
};

const CARDS: Card[] = [
  { to: "/admin/staff", title: "Personal", items: "Mitarbeiter, Dienstplan, Zeitübersicht" },
  { to: "/admin/kasse", title: "Kasse", items: "Tagesabschlüsse, Saldo" },
  {
    to: "/admin/bestellung",
    title: "Bestellung",
    items: "Warenkorb, EasyOrder, Bestellungen, Lieferanten, Artikel, Inventur, Wein",
  },
  { to: "/admin/locations", title: "Stammdaten", items: "Standorte" },
  { to: "/admin/migration", title: "System", items: "Migration, Zuordnungen", adminOnly: true, muted: true },
];

function AdminIndex() {
  const identity = Route.useLoaderData();
  const cards = CARDS.filter((c) => !c.adminOnly || identity.role === "admin");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Verwaltung</h1>
        <p className="text-sm text-muted-foreground">
          Übersicht aller Bereiche. Klick auf eine Karte öffnet den Bereich mit seinen Werkzeugen.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className={
              "group flex items-start justify-between rounded-lg border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:bg-accent hover:shadow-sm" +
              (c.muted ? " opacity-80" : "")
            }
          >
            <div>
              <div className="font-medium text-foreground">{c.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.items}</div>
            </div>
            <span
              className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
