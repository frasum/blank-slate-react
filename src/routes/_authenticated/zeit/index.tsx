import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Clock, CalendarDays, Receipt, Heart, Plane } from "lucide-react";

export const Route = createFileRoute("/_authenticated/zeit/")({
  head: () => ({
    meta: [
      { title: "Zeit" },
      { name: "description", content: "Self-Service: Stempeln, Schichten, Abrechnung" },
    ],
  }),
  component: ZeitHub,
});

type Tile = {
  to:
    | "/zeit/stempeln"
    | "/zeit/schichten"
    | "/zeit/abrechnung"
    | "/zeit/wuensche"
    | "/zeit/urlaub";
  title: string;
  description: string;
  Icon: typeof Clock;
  iconClassName?: string;
};

const TILES: Tile[] = [
  {
    to: "/zeit/stempeln",
    title: "Stempeluhr",
    description: "Ein- und ausstempeln.",
    Icon: Clock,
  },
  {
    to: "/zeit/schichten",
    title: "Meine Schichten",
    description: "Geplante Schichten der kommenden Wochen.",
    Icon: CalendarDays,
  },
  {
    to: "/zeit/abrechnung",
    title: "Abrechnung",
    description: "Kellner-Abrechnung am Schichtende.",
    Icon: Receipt,
  },
  {
    to: "/zeit/wuensche",
    title: "Freie Tage wünschen",
    description: "Wunsch-freie Tage eintragen (unverbindlich).",
    Icon: Heart,
    iconClassName: "fill-purple-600 text-purple-600",
  },
  {
    to: "/zeit/urlaub",
    title: "Urlaub beantragen",
    description: "Antrag stellen, Status verfolgen.",
    Icon: Plane,
  },
];

function ZeitHub() {
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Zeit</h1>
        <p className="text-sm text-muted-foreground">Self-Service für Mitarbeiter.</p>
      </header>
      <div className="grid gap-3">
        {TILES.map(({ to, title, description, Icon, iconClassName }) => (
          <Link key={to} to={to} className="block">
            <Card className="flex items-center gap-4 p-5 transition hover:bg-accent/40">
              <div className="rounded-md bg-primary/10 p-3 text-primary">
                <Icon
                  className={`h-6 w-6${iconClassName ? ` ${iconClassName}` : ""}`}
                  aria-hidden
                />
              </div>
              <div className="space-y-0.5">
                <div className="font-medium">{title}</div>
                <div className="text-sm text-muted-foreground">{description}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
