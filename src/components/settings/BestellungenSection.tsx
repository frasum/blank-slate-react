// Sektion „Testmodus Bestellungen" — extrahiert im Rahmen von EIN1.
// Reine UI-Umgruppierung; teilt sich die org-settings-Mutation mit
// TrinkgeldpoolSection (siehe Kommentar dort).

type Props = {
  canEdit: boolean;
  testModeEnabled: boolean;
  setTestModeEnabled: (value: boolean) => void;
  testModeEmail: string;
  setTestModeEmail: (value: string) => void;
  msg: string | null;
  err: string | null;
  isPending: boolean;
  onSave: () => void;
};

export function BestellungenSection({
  canEdit,
  testModeEnabled,
  setTestModeEnabled,
  testModeEmail,
  setTestModeEmail,
  msg,
  err,
  isPending,
  onSave,
}: Props) {
  return (
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

      <label className="flex flex-col gap-1">
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

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}

      {canEdit && (
        <button
          type="button"
          disabled={isPending}
          onClick={onSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Speichern…" : "Speichern"}
        </button>
      )}
    </section>
  );
}
