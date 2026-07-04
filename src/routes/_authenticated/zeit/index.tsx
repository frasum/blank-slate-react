import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import {
  Clock,
  CalendarDays,
  Receipt,
  Heart,
  Plane,
  ListChecks,
  CalendarPlus,
  Hourglass,
} from "lucide-react";
import { listOpenSwapsForMe } from "@/lib/roster/swap.functions";

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
    | "/zeit/stunden"
    | "/zeit/abrechnung"
    | "/zeit/wuensche"
    | "/zeit/urlaub"
    | "/zeit/aufgaben"
    | "/zeit/kalender";
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
    description:
      "Geplante Schichten der kommenden Wochen — zum Tausch anbieten, Anfragen von Kollegen annehmen.",
    Icon: CalendarDays,
  },
  {
    to: "/zeit/stunden",
    title: "Meine Stunden",
    description: "Gearbeitete Schichten & Stundensumme der Abrechnungsperiode.",
    Icon: Hourglass,
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
  {
    to: "/zeit/aufgaben",
    title: "Aufgaben",
    description: "Offene Aufgaben deiner Standorte – übernehmen und erledigen.",
    Icon: ListChecks,
  },
  {
    to: "/zeit/kalender",
    title: "Kalender-Abo",
    description: "Schichten im Handy-Kalender abonnieren (iPhone & Android).",
    Icon: CalendarPlus,
  },
];

function ZeitHub() {
  const fetchOpen = useServerFn(listOpenSwapsForMe);
  const openSwapsQuery = useQuery({
    queryKey: ["swaps-open-for-me"],
    queryFn: () => fetchOpen(),
  });
  const openSwapsCount = openSwapsQuery.isError ? 0 : (openSwapsQuery.data?.length ?? 0);

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
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{title}</span>
                  {to === "/zeit/schichten" && openSwapsCount > 0 && (
                    <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      {openSwapsCount}
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{description}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
