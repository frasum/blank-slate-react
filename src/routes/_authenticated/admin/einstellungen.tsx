// Organisations-Einstellungen (admin only zum Schreiben, manager liest).
// Aktuell verwaltet:
//   * Küchen-Trinkgeldsatz (Anteil des Service-Bruttoumsatzes als Küchenpool)
//   * Mindeststunden pro Geschäftstag für die Trinkgeldpool-Teilnahme
//
// Geld-Wirkung: Änderungen wirken auf alle zukünftigen Pool-Berechnungen
// derselben Organisation. Bestehende waiter_settlements behalten ihre
// gespeicherte kitchen_tip_rate (siehe cash.functions Z. 9).

import { useEffect, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrgSettings,
  setArbeitgeberStammdaten,
  updateOrgSettings,
  setTelegramBotUsername,
} from "@/lib/admin/org-settings.functions";
import { setBetriebsnummer } from "@/lib/sofortmeldung/sofortmeldung.functions";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
  head: () => ({ meta: [{ title: "Einstellungen · Verwaltung" }] }),
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const canEdit = identity.role === "admin";
  const queryClient = useQueryClient();
  const callUpdate = useServerFn(updateOrgSettings);

  const settingsQ = useQuery({
    queryKey: ["admin", "org-settings"],
    queryFn: () => getOrgSettings(),
  });

  // Eingaben als String, damit der User „2,50" tippen kann ohne dass jede
  // Tastatureingabe Number-parsiert wird (Komma → Punkt erst beim Speichern).
  const [tipRatePercent, setTipRatePercent] = useState("");
  const [minHours, setMinHours] = useState("");
  const [kitchenManualOnly, setKitchenManualOnly] = useState(false);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testModeEmail, setTestModeEmail] = useState("");
  const [betriebsnummer, setBetriebsnummerLocal] = useState("");
  const [bnMsg, setBnMsg] = useState<string | null>(null);
  const [bnErr, setBnErr] = useState<string | null>(null);
  const callSetBn = useServerFn(setBetriebsnummer);
  const [agName, setAgName] = useState("");
  const [agAdresse, setAgAdresse] = useState("");
  const [agVertreter, setAgVertreter] = useState("");
  const [agMsg, setAgMsg] = useState<string | null>(null);
  const [agErr, setAgErr] = useState<string | null>(null);
  const callSetArbeitgeber = useServerFn(setArbeitgeberStammdaten);
  const [tgBot, setTgBot] = useState("");
  const [tgMsg, setTgMsg] = useState<string | null>(null);
  const [tgErr, setTgErr] = useState<string | null>(null);
  const callSetTgBot = useServerFn(setTelegramBotUsername);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setTipRatePercent((settingsQ.data.kitchenTipRate * 100).toFixed(2));
    setMinHours(settingsQ.data.tipPoolMinHours.toFixed(2));
    setKitchenManualOnly(settingsQ.data.kitchenManualOnly);
    setTestModeEnabled(settingsQ.data.testModeEnabled);
    setTestModeEmail(settingsQ.data.testModeEmail ?? "");
    setBetriebsnummerLocal(settingsQ.data.betriebsnummer ?? "");
    setAgName(settingsQ.data.arbeitgeberName ?? "");
    setAgAdresse(settingsQ.data.arbeitgeberAdresse ?? "");
    setAgVertreter(settingsQ.data.arbeitgeberVertreter ?? "");
    setTgBot(settingsQ.data.telegramBotUsername ?? "");
  }, [settingsQ.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const rate = parseLocaleNumber(tipRatePercent) / 100;
      const hours = parseLocaleNumber(minHours);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new Error("Küchen-Trinkgeldsatz: 0 bis 100 % erlaubt.");
      }
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        throw new Error("Mindeststunden: 0 bis 24 erlaubt.");
      }
      const trimmedEmail = testModeEmail.trim();
      if (testModeEnabled && !trimmedEmail) {
        throw new Error("Bei aktivem Testmodus ist eine E-Mail-Adresse Pflicht.");
      }
      if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error("Test-E-Mail-Adresse ist ungültig.");
      }
      return callUpdate({
        data: {
          kitchenTipRate: rate,
          tipPoolMinHours: hours,
          kitchenManualOnly,
          testModeEnabled,
          testModeEmail: trimmedEmail === "" ? null : trimmedEmail,
        },
      });
    },
    onSuccess: async () => {
      setMsg("Gespeichert.");
      setErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : "Fehler.");
      setMsg(null);
    },
  });

  const bnMutation = useMutation({
    mutationFn: () => callSetBn({ data: { betriebsnummer: betriebsnummer.trim() || null } }),
    onSuccess: async () => {
      setBnMsg("Gespeichert.");
      setBnErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setBnErr(e instanceof Error ? e.message : "Fehler.");
      setBnMsg(null);
    },
  });

  const agMutation = useMutation({
    mutationFn: () =>
      callSetArbeitgeber({
        data: {
          arbeitgeberName: agName.trim() || null,
          arbeitgeberAdresse: agAdresse.trim() || null,
          arbeitgeberVertreter: agVertreter.trim() || null,
        },
      }),
    onSuccess: async () => {
      setAgMsg("Gespeichert.");
      setAgErr(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => {
      setAgErr(e instanceof Error ? e.message : "Fehler.");
      setAgMsg(null);
    },
  });

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

  if (settingsQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (settingsQ.error)
    return <p className="text-sm text-destructive">Einstellungen konnten nicht geladen werden.</p>;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisationsweite Geschäftsregeln. {canEdit ? "Nur Admin darf ändern." : "Nur lesen."}
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Trinkgeldpool</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Regeln für Aufteilung und Teilnahme am Trinkgeldpool.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            setErr(null);
            mutation.mutate();
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Küchen-Trinkgeldsatz (% vom Service-Bruttoumsatz)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={tipRatePercent}
              onChange={(e) => setTipRatePercent(e.target.value)}
              disabled={!canEdit}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            <span className="ml-2 text-xs text-muted-foreground">z. B. 2,00 = 2 %</span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Mindeststunden pro Geschäftstag für Trinkgeldpool
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={minHours}
              onChange={(e) => setMinHours(e.target.value)}
              disabled={!canEdit}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            <span className="ml-2 text-xs text-muted-foreground">
              Tagessumme, inklusive Grenze (2,50 = 2:30 zählt mit, 2:29 nicht)
            </span>
          </label>

          <label className="flex items-start gap-3 pt-1">
            <input
              type="checkbox"
              checked={kitchenManualOnly}
              onChange={(e) => setKitchenManualOnly(e.target.checked)}
              disabled={!canEdit}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <span className="text-sm text-foreground">
              Küchentrinkgeld manuell verteilen (Stempelzeiten der Küche ignorieren)
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Wenn aktiv, fließt die Küche nur über manuell eingetragene Schichten (Start/Ende) in
                den Pool. Service bleibt unverändert über Stempelzeiten.
              </span>
            </span>
          </label>

          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          {err && <p className="text-xs text-destructive">{err}</p>}

          {canEdit && (
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {mutation.isPending ? "Speichern…" : "Speichern"}
            </button>
          )}
        </form>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Testmodus Bestellungen</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Solange der Testmodus aktiv ist, gehen <strong>alle</strong> Bestell-E-Mails (inkl.
            EasyOrder-Auto-Versand) ausschließlich an die hier hinterlegte Adresse. Lieferanten
            erhalten in diesem Modus nichts.
          </p>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={testModeEnabled}
            onChange={(e) => setTestModeEnabled(e.target.checked)}
            disabled={!canEdit}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm text-foreground">Testmodus aktiv</span>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Test-E-Mail-Adresse</span>
          <input
            type="email"
            value={testModeEmail}
            onChange={(e) => setTestModeEmail(e.target.value)}
            disabled={!canEdit}
            placeholder="test@example.com"
            className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        {canEdit && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setMsg(null);
              setErr(null);
              mutation.mutate();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Speichern…" : "Speichern"}
          </button>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Sofortmeldung</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Betriebsnummer der Krankenkassen-Meldestelle. Erscheint im sv.net-Datenblock beim
            Stammblatt jedes Mitarbeiters.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Betriebsnummer</span>
          <input
            type="text"
            inputMode="numeric"
            value={betriebsnummer}
            onChange={(e) => setBetriebsnummerLocal(e.target.value)}
            disabled={!canEdit}
            placeholder="z. B. 12345678"
            className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        {bnMsg && <p className="text-xs text-muted-foreground">{bnMsg}</p>}
        {bnErr && <p className="text-xs text-destructive">{bnErr}</p>}

        {canEdit && (
          <button
            type="button"
            disabled={bnMutation.isPending}
            onClick={() => {
              setBnMsg(null);
              setBnErr(null);
              bnMutation.mutate();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {bnMutation.isPending ? "Speichern…" : "Speichern"}
          </button>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Arbeitgeber-Stammdaten</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Werden in Dokumenten (Arbeitsverträge, Bescheinigungen) über die Platzhalter{" "}
            <code>{"{{arbeitgeber_name}}"}</code>, <code>{"{{arbeitgeber_adresse}}"}</code> und{" "}
            <code>{"{{arbeitgeber_vertreter}}"}</code> verwendet.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Firmenname</span>
          <input
            type="text"
            value={agName}
            onChange={(e) => setAgName(e.target.value)}
            disabled={!canEdit}
            placeholder="z. B. Musterbetrieb GmbH"
            className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Anschrift</span>
          <textarea
            value={agAdresse}
            onChange={(e) => setAgAdresse(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder={"Straße Nr.\nPLZ Ort"}
            className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Vertretungsberechtigte Person
          </span>
          <input
            type="text"
            value={agVertreter}
            onChange={(e) => setAgVertreter(e.target.value)}
            disabled={!canEdit}
            placeholder="Vor- und Nachname"
            className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        {agMsg && <p className="text-xs text-muted-foreground">{agMsg}</p>}
        {agErr && <p className="text-xs text-destructive">{agErr}</p>}

        {canEdit && (
          <button
            type="button"
            disabled={agMutation.isPending}
            onClick={() => {
              setAgMsg(null);
              setAgErr(null);
              agMutation.mutate();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {agMutation.isPending ? "Speichern…" : "Speichern"}
          </button>
        )}
      </section>

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
    </div>
  );
}

function parseLocaleNumber(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return NaN;
  return Number(normalized);
}
