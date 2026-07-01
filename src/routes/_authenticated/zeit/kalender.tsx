import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getOrCreateMyCalendarToken,
  revokeMyCalendarToken,
} from "@/lib/calendar/calendar-token.functions";

export const Route = createFileRoute("/_authenticated/zeit/kalender")({
  head: () => ({
    meta: [
      { title: "Kalender-Abo" },
      {
        name: "description",
        content: "Persönlicher Kalender-Abo-Link für den Dienstplan.",
      },
    ],
  }),
  component: KalenderPage,
});

function KalenderPage() {
  const qc = useQueryClient();
  const fnGet = useServerFn(getOrCreateMyCalendarToken);
  const fnRevoke = useServerFn(revokeMyCalendarToken);

  const q = useQuery({
    queryKey: ["zeit", "calendar-token"],
    queryFn: () => fnGet(),
    staleTime: 5 * 60 * 1000,
  });

  const revokeMut = useMutation({
    mutationFn: async () => {
      await fnRevoke();
      await qc.invalidateQueries({ queryKey: ["zeit", "calendar-token"] });
      await q.refetch();
    },
    onSuccess: () =>
      toast.success("Alter Link deaktiviert — bitte Abo mit dem neuen Link neu einrichten."),
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urls = useMemo(() => {
    if (!q.data?.feedPath || !origin) return null;
    const httpsUrl = origin + q.data.feedPath;
    const webcalUrl = origin.replace(/^https?:/, "webcal:") + q.data.feedPath;
    return { httpsUrl, webcalUrl };
  }, [q.data, origin]);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!urls) return;
    try {
      await navigator.clipboard.writeText(urls.httpsUrl);
      setCopied(true);
      toast.success("Link kopiert");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen — Link manuell markieren.");
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Kalender-Abo</h1>
        <p className="text-sm text-muted-foreground">
          Abonniere deine eingeteilten Schichten einmalig in deinem Handy-Kalender. Neue oder
          geänderte Schichten erscheinen dann automatisch.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Lädt…</div>
        ) : q.error || !urls ? (
          <div className="space-y-2">
            <div className="text-sm text-destructive">Link konnte nicht geladen werden.</div>
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              Erneut versuchen
            </Button>
          </div>
        ) : (
          <>
            <div>
              <a href={urls.webcalUrl}>
                <Button className="w-full" size="lg">
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                  Im Kalender öffnen
                </Button>
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                Öffnet auf dem iPhone direkt den Abo-Dialog.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ical-url">Abo-Link (für Android / Google Kalender)</Label>
              <div className="flex gap-2">
                <Input
                  id="ical-url"
                  readOnly
                  value={urls.httpsUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button variant="outline" onClick={copy} aria-label="Link kopieren">
                  <Copy className="h-4 w-4" aria-hidden />
                  <span className="ml-2 hidden sm:inline">{copied ? "Kopiert" : "Kopieren"}</span>
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Dieser Link ist persönlich — nicht weitergeben. Wer ihn hat, sieht deinen Dienstplan.
            </p>
          </>
        )}
      </Card>

      <Card className="p-2">
        <Accordion type="single" collapsible>
          <AccordionItem value="iphone">
            <AccordionTrigger className="px-3">Anleitung iPhone</AccordionTrigger>
            <AccordionContent className="px-3 text-sm text-muted-foreground">
              „Im Kalender öffnen" antippen und bestätigen. Alternativ: Einstellungen → Kalender →
              Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen → Link einfügen.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="android">
            <AccordionTrigger className="px-3">Anleitung Android / Google Kalender</AccordionTrigger>
            <AccordionContent className="px-3 text-sm text-muted-foreground">
              Link kopieren → am Computer{" "}
              <span className="font-mono">calendar.google.com</span> öffnen → links bei „Weitere
              Kalender" auf „+" → „Per URL" → Link einfügen → „Kalender hinzufügen". Erscheint
              danach automatisch auf dem Android-Handy.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <Card className="space-y-3 p-5">
        <div>
          <div className="text-sm font-medium">Link zurückziehen</div>
          <div className="text-xs text-muted-foreground">
            Erstellt einen neuen Link. Der alte hört auf zu funktionieren — bestehende Abos brechen
            und müssen mit dem neuen Link neu eingerichtet werden.
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={revokeMut.isPending || q.isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              Link zurückziehen & neuen erstellen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wirklich zurückziehen?</AlertDialogTitle>
              <AlertDialogDescription>
                Bestehende Abos in deinem Kalender hören auf zu aktualisieren. Du musst danach den
                neuen Link erneut einrichten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => revokeMut.mutate()}>
                Ja, zurückziehen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </main>
  );
}