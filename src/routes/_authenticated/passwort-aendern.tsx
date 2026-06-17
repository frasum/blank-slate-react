// Erzwungener Passwort-Wechsel nach Erst-Login oder Admin-Reset.
//
// Liegt unter /_authenticated, damit der Aufrufer eingeloggt sein muss.
// Der Wechsel selbst läuft über supabase.auth.updateUser im Client;
// danach setzt eine Server-Function must_change_password=false und
// schreibt Audit.

import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { markPasswordChanged } from "@/lib/auth/password-change.functions";
import { BrandLockup } from "@/components/brand-lockup";

export const Route = createFileRoute("/_authenticated/passwort-aendern")({
  head: () => ({
    meta: [{ title: "Passwort ändern · COCO" }, { name: "robots", content: "noindex" }],
  }),
  component: PasswordChangePage,
});

function PasswordChangePage() {
  const router = useRouter();
  const navigate = useNavigate();
  const callMark = useServerFn(markPasswordChanged);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <BrandLockup size="lg" />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">Neues Passwort setzen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vor dem ersten Arbeitsschritt musst du ein eigenes Passwort vergeben.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            if (pw1.length < 10) {
              setErr("Passwort muss mindestens 10 Zeichen lang sein.");
              return;
            }
            if (pw1 !== pw2) {
              setErr("Passwörter stimmen nicht überein.");
              return;
            }
            setBusy(true);
            const { error } = await supabase.auth.updateUser({ password: pw1 });
            if (error) {
              setBusy(false);
              setErr(error.message);
              return;
            }
            try {
              await callMark({});
            } catch (e) {
              setBusy(false);
              setErr(e instanceof Error ? e.message : "Fehler beim Bestätigen.");
              return;
            }
            await router.invalidate();
            await navigate({ to: "/" });
          }}
        >
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Neues Passwort (min. 10 Zeichen)"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Passwort wiederholen"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Speichern…" : "Passwort speichern"}
          </button>
        </form>

        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            await navigate({ to: "/auth" });
          }}
          className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Abmelden
        </button>
      </div>
    </main>
  );
}