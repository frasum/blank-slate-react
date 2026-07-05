// Sektion „Telegram-Bot" — extrahiert im Rahmen von EIN1.
// Self-contained; Verhalten und Texte 1:1 wie zuvor.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrgSettings,
  setTelegramBotUsername,
} from "@/lib/admin/org-settings.functions";

export function TelegramBotSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const callSetTgBot = useServerFn(setTelegramBotUsername);

  const settingsQ = useQuery({
    queryKey: ["admin", "org-settings"],
    queryFn: () => getOrgSettings(),
  });

  const [tgBot, setTgBot] = useState("");
  const [tgMsg, setTgMsg] = useState<string | null>(null);
  const [tgErr, setTgErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setTgBot(settingsQ.data.telegramBotUsername ?? "");
  }, [settingsQ.data]);

  const tgMutation = useMutation({
    mutationFn: () =>
      callSetTgBot({
        data: { telegramBotUsername: tgBot.trim().replace(/^@/, "") || null },
      }),
    onSuccess: async () => {
      setTgMsg("Gespeichert.");
      setTgErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setTgErr(e instanceof Error ? e.message : "Fehler.");
      setTgMsg(null);
    },
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Telegram-Bot</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Öffentlicher @-Handle des BotFather-Bots (z.&nbsp;B. <code>coco_platform_bot</code>).
          Wird für den Verknüpfungs-Deep-Link in „Meine Daten" gebraucht. Der Bot-Token selbst
          liegt sicher als Connector-Secret und wird hier nicht eingegeben.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Bot-Username</span>
        <input
          type="text"
          value={tgBot}
          onChange={(e) => setTgBot(e.target.value)}
          disabled={!canEdit}
          placeholder="z. B. coco_platform_bot"
          className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      {tgMsg && <p className="text-xs text-muted-foreground">{tgMsg}</p>}
      {tgErr && <p className="text-xs text-destructive">{tgErr}</p>}

      {canEdit && (
        <button
          type="button"
          disabled={tgMutation.isPending}
          onClick={() => {
            setTgMsg(null);
            setTgErr(null);
            tgMutation.mutate();
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {tgMutation.isPending ? "Speichern…" : "Speichern"}
        </button>
      )}
    </section>
  );
}