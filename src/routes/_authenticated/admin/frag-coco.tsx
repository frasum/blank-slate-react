// KI1 — "Frag COCO" Chat-Seite (admin-only). Konversation lebt clientseitig
// (kein Persistieren in Welle 1). Sendet die letzten ~10 Nachrichten mit
// jeder Anfrage; die Server-Fn askCoco kümmert sich um Pseudonymisierung,
// Tool-Loop, Logging.

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Send, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  askCoco,
  getKiUsageMonth,
  type AskCocoResult,
  type KiUsageMonth,
} from "@/lib/ki/ask-coco.functions";
import { formatEurFromMicroCents } from "@/lib/ki/cost";
import { useSpeechInput } from "@/lib/ki/use-speech-input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/frag-coco")({
  head: () => ({ meta: [{ title: "Frag COCO · KI-Assistent" }] }),
  component: FragCocoPage,
});

type Turn = {
  role: "user" | "assistant";
  text: string;
  meta?: {
    tools: string[];
    rounds: number;
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
};

const MAX_HISTORY_TO_SEND = 10;
const INTRO_STORAGE_KEY = "coco-ki-intro-dismissed";

function FragCocoPage() {
  const callAsk = useServerFn(askCoco);
  const callUsage = useServerFn(getKiUsageMonth);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [showIntro, setShowIntro] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(INTRO_STORAGE_KEY) === "1") setShowIntro(false);
    } catch {
      /* SSR / privater Modus */
    }
  }, []);

  const usageQ = useQuery<KiUsageMonth>({
    queryKey: ["ki-usage-month"],
    queryFn: () => callUsage({ data: {} }),
    refetchOnWindowFocus: false,
  });

  const send = useMutation({
    mutationFn: async (question: string) => {
      const history = turns.slice(-MAX_HISTORY_TO_SEND).map((t) => ({
        role: t.role,
        text: t.text,
      }));
      return (await callAsk({ data: { question, history } })) as AskCocoResult;
    },
    onSuccess: (res) => {
      if (res.ok) {
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            text: res.answer,
            meta: {
              tools: res.toolsUsed,
              rounds: res.rounds,
              inputTokens: res.usage.inputTokens,
              outputTokens: res.usage.outputTokens,
              model: res.model,
            },
          },
        ]);
      } else {
        setTurns((prev) => [...prev, { role: "assistant", text: res.notice }]);
      }
      void usageQ.refetch();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Unerwarteter Fehler.");
    },
  });

  const submitQuestion = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || send.isPending) return;
    setTurns((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setError(null);
    send.mutate(trimmed);
  };

  const speech = useSpeechInput({
    lang: "de-DE",
    onFinished: (text) => submitQuestion(text),
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, send.isPending]);

  const busy = send.isPending;
  const canSend = input.trim().length > 0 && !busy;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    submitQuestion(input);
  };

  // Push-to-Talk: Leertaste-Halten bei fokussiertem Mikrofon-Knopf.
  const isTouch =
    typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

  const startMic = () => {
    if (busy || speech.isRecording) return;
    speech.start();
  };
  const stopMic = () => {
    if (!speech.isRecording) return;
    speech.stop();
  };
  const toggleMic = () => {
    if (speech.isRecording) stopMic();
    else startMic();
  };

  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const monthlyLabel = useMemo(() => {
    const u = usageQ.data;
    if (!u) return null;
    const ym = u.yearMonth;
    const [, m] = ym.split("-");
    const monthNames = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];
    const monthLabel = monthNames[Number(m) - 1] ?? ym;
    return `${monthLabel}: ${u.requests} Fragen · ~${formatEurFromMicroCents(u.costMicroCents)} €`;
  }, [usageQ.data]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-6">
      <header className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Frag COCO</h2>
          <p className="text-sm text-muted-foreground">
            Stell natürliche Fragen zu deinen Betriebsdaten — COCO rechnet nicht selbst, sondern
            zieht Antworten aus deinen Auswertungen.
          </p>
        </div>
      </header>

      {showIntro && (
        <Alert>
          <AlertTitle>Kurzer Hinweis vorab</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Antworten basieren ausschließlich auf COCO-Auswertungen (Renner &amp; Penner, Umsatz,
              Arbeitszeiten, Abwesenheiten). Bei Unsicherheit prüfe die genannte Auswertung direkt.
            </p>
            <p className="text-xs text-muted-foreground">
              Personendaten werden vor jedem KI-Aufruf pseudonymisiert (MA-1, MA-2 …) und in der
              Antwort wieder in Klarnamen zurückgetauscht.
            </p>
            {speech.isSupported && (
              <p className="text-xs text-muted-foreground">
                Die Spracherkennung nutzt den Dienst deines Browsers (Chrome/Safari transkribieren
                serverseitig beim jeweiligen Anbieter).
              </p>
            )}
            <Button size="sm" variant="outline" onClick={dismissIntro}>
              Verstanden
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex min-h-[50vh] flex-col gap-3 rounded-md border border-border bg-card p-3">
        {turns.length === 0 && !busy ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <div className="max-w-md space-y-2 text-center">
              <p>Beispiel-Fragen:</p>
              <ul className="space-y-1 text-left text-xs">
                <li>• „Wie viele Flaschen Chardonnay gingen letzten Monat?"</li>
                <li>• „Wer hatte im letzten Quartal die meisten Krankheitstage?"</li>
                <li>• „Küchenstunden vs. Umsatz — hat sich das rentiert?"</li>
              </ul>
            </div>
          </div>
        ) : (
          turns.map((t, i) => <TurnBubble key={i} turn={t} />)
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            COCO rechnet …
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {speech.isRecording && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <span className="text-foreground">Höre zu …</span>
          <span className="truncate text-muted-foreground">
            {speech.finalText}
            {speech.interimText && (
              <em className="ml-1 italic opacity-70">{speech.interimText}</em>
            )}
          </span>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          rows={2}
          placeholder="Frag COCO … (Enter = senden, Shift+Enter = neue Zeile)"
          className="min-h-[3rem] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={busy || speech.isRecording}
          aria-label="Deine Frage an COCO"
        />
        {speech.isSupported && (
          <Button
            ref={micButtonRef}
            type="button"
            variant={speech.isRecording ? "destructive" : "outline"}
            disabled={busy}
            title={
              speech.permission === "denied"
                ? "Mikrofon im Browser erlauben"
                : isTouch
                  ? "Antippen zum Starten/Stoppen"
                  : "Gedrückt halten (oder Leertaste) zum Sprechen"
            }
            aria-label={speech.isRecording ? "Aufnahme stoppen" : "Sprachaufnahme starten"}
            aria-pressed={speech.isRecording}
            onMouseDown={(e) => {
              if (isTouch) return;
              e.preventDefault();
              startMic();
            }}
            onMouseUp={(e) => {
              if (isTouch) return;
              e.preventDefault();
              stopMic();
            }}
            onMouseLeave={() => {
              if (isTouch) return;
              if (speech.isRecording) stopMic();
            }}
            onClick={(e) => {
              if (!isTouch) return;
              e.preventDefault();
              toggleMic();
            }}
            onKeyDown={(e) => {
              if (e.key === " " && !e.repeat) {
                e.preventDefault();
                startMic();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " ") {
                e.preventDefault();
                stopMic();
              }
            }}
          >
            <Mic className={cn("h-4 w-4", speech.isRecording && "animate-pulse")} />
          </Button>
        )}
        <Button type="submit" disabled={!canSend}>
          <Send className="mr-1 h-4 w-4" />
          Senden
        </Button>
      </form>

      <footer className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Modell: {turns.at(-1)?.meta?.model ?? "claude-haiku-4-5"}</span>
        {monthlyLabel && <span>{monthlyLabel}</span>}
      </footer>
    </div>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-background text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
        {turn.meta && turn.meta.tools.length > 0 && (
          <p className="mt-2 border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
            Werkzeuge: {turn.meta.tools.join(", ")} · {turn.meta.rounds} Runde
            {turn.meta.rounds === 1 ? "" : "n"} · {turn.meta.inputTokens + turn.meta.outputTokens}{" "}
            Token
          </p>
        )}
      </div>
    </div>
  );
}
