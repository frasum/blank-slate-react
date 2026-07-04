import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyTelegramLink } from "@/lib/telegram/telegram.functions";

// Dezenter Hinweis-Banner: erscheint solange kein Telegram-Chat verknuepft ist.
// Query-Key identisch zu TelegramCard in /profil → gemeinsamer Cache,
// nach erfolgreicher Verknuepfung verschwindet der Banner automatisch.
export function TelegramLinkBanner() {
  const [dismissed, setDismissed] = useState(false);
  const q = useQuery({
    queryKey: ["profile", "telegram-link"],
    queryFn: () => getMyTelegramLink(),
    staleTime: 60_000,
  });

  if (dismissed) return null;
  if (q.isLoading || q.isError || !q.data) return null;
  if (q.data.status === "linked") return null;
  // Ohne konfigurierten Bot kann der Mitarbeiter nichts tun → nicht nerven.
  if (!q.data.botUsername) return null;

  const pending = q.data.status === "pending";

  return (
    <div className="border-b bg-muted/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <Send className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-foreground">
          {pending
            ? "Telegram-Verknuepfung offen — bitte im Telegram-Chat auf ‚Start' tippen."
            : "Telegram noch nicht verknuepft — erhalte Push-Nachrichten aus COCO direkt in Telegram."}
        </span>
        <Button asChild size="sm" variant="default">
          <Link to="/profil" hash="telegram">
            {pending ? "Telegram oeffnen" : "Jetzt verknuepfen"}
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Hinweis fuer diese Sitzung ausblenden"
          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}