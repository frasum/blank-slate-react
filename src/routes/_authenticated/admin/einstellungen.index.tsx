// Organisations-Einstellungen (admin only zum Schreiben, manager liest).
// EIN1 (05.07.2026): Der frühere lange Kartenstapel ist in vier
// Unter-Tabs gegliedert (Trinkgeldpool · Bestellungen ·
// Sofortmeldung & Arbeitgeber · Telegram). Reine UI-Umgruppierung —
// die Sektionen selbst leben jetzt in src/components/settings/. Der
// aktive Tab wird als Search-Param `?tab=…` in der URL geführt, damit
// Reload und Verlinkung die Position halten.
//
// Die org-settings-Mutation (updateOrgSettings) bleibt bewusst hier
// im Container — sie erwartet alle fünf Felder gemeinsam und wird von
// TrinkgeldpoolSection UND BestellungenSection geteilt, damit das
// bisherige Speicherverhalten beider Karten Zeichen für Zeichen
// erhalten bleibt.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrgSettings,
  updateOrgSettings,
} from "@/lib/admin/org-settings.functions";
import { TrinkgeldpoolSection } from "@/components/settings/TrinkgeldpoolSection";
import { BestellungenSection } from "@/components/settings/BestellungenSection";
import { SofortmeldungSection } from "@/components/settings/SofortmeldungSection";
import { ArbeitgeberSection } from "@/components/settings/ArbeitgeberSection";
import { TelegramBotSection } from "@/components/settings/TelegramBotSection";
import { TelegramTagesberichtSection } from "@/components/settings/TelegramTagesberichtSection";

const SUB_TABS = [
  { key: "trinkgeldpool", label: "Trinkgeldpool" },
  { key: "bestellungen", label: "Bestellungen" },
  { key: "sofortmeldung", label: "Sofortmeldung & Arbeitgeber" },
  { key: "telegram", label: "Telegram" },
] as const;

type TabKey = (typeof SUB_TABS)[number]["key"];
const TAB_KEYS = SUB_TABS.map((t) => t.key) as readonly TabKey[];

function isTabKey(value: unknown): value is TabKey {
  return typeof value === "string" && (TAB_KEYS as readonly string[]).includes(value);
}

export const Route = createFileRoute("/_authenticated/admin/einstellungen/")({
  head: () => ({ meta: [{ title: "Einstellungen · Verwaltung" }] }),
  validateSearch: (search: Record<string, unknown>): { tab: TabKey } => ({
    tab: isTabKey(search.tab) ? search.tab : "trinkgeldpool",
  }),
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const canEdit = identity.role === "admin";
  const queryClient = useQueryClient();
  const callUpdate = useServerFn(updateOrgSettings);
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab } = Route.useSearch();

  const settingsQ = useQuery({
    queryKey: ["admin", "org-settings"],
    queryFn: () => getOrgSettings(),
  });

  // Geteilter Form-State für Trinkgeldpool + Bestellungen (siehe Kopf-Kommentar).
  const [tipRatePercent, setTipRatePercent] = useState("");
  const [minHours, setMinHours] = useState("");
  const [kitchenManualOnly, setKitchenManualOnly] = useState(false);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testModeEmail, setTestModeEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setTipRatePercent((settingsQ.data.kitchenTipRate * 100).toFixed(2));
    setMinHours(settingsQ.data.tipPoolMinHours.toFixed(2));
    setKitchenManualOnly(settingsQ.data.kitchenManualOnly);
    setTestModeEnabled(settingsQ.data.testModeEnabled);
    setTestModeEmail(settingsQ.data.testModeEmail ?? "");
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

  if (settingsQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (settingsQ.error)
    return <p className="text-sm text-destructive">Einstellungen konnten nicht geladen werden.</p>;

  const handleTrinkgeldpoolSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    mutation.mutate();
  };

  const handleBestellungenSave = () => {
    setMsg(null);
    setErr(null);
    mutation.mutate();
  };

  const goToTab = (key: TabKey) => {
    void navigate({ search: { tab: key }, replace: true });
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisationsweite Geschäftsregeln. {canEdit ? "Nur Admin darf ändern." : "Nur lesen."}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Einstellungen-Untergruppen"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {SUB_TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => goToTab(t.key)}
              className={
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-8">
        {tab === "trinkgeldpool" && (
          <TrinkgeldpoolSection
            canEdit={canEdit}
            tipRatePercent={tipRatePercent}
            setTipRatePercent={setTipRatePercent}
            minHours={minHours}
            setMinHours={setMinHours}
            kitchenManualOnly={kitchenManualOnly}
            setKitchenManualOnly={setKitchenManualOnly}
            msg={msg}
            err={err}
            isPending={mutation.isPending}
            onSubmit={handleTrinkgeldpoolSubmit}
          />
        )}

        {tab === "bestellungen" && (
          <BestellungenSection
            canEdit={canEdit}
            testModeEnabled={testModeEnabled}
            setTestModeEnabled={setTestModeEnabled}
            testModeEmail={testModeEmail}
            setTestModeEmail={setTestModeEmail}
            msg={msg}
            err={err}
            isPending={mutation.isPending}
            onSave={handleBestellungenSave}
          />
        )}

        {tab === "sofortmeldung" && (
          <>
            <SofortmeldungSection canEdit={canEdit} />
            <ArbeitgeberSection canEdit={canEdit} />
          </>
        )}

        {tab === "telegram" && (
          <>
            <TelegramBotSection canEdit={canEdit} />
            <TelegramTagesberichtSection canEdit={canEdit} />
          </>
        )}
      </div>
    </div>
  );
}

function parseLocaleNumber(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return NaN;
  return Number(normalized);
}