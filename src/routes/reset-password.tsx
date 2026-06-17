// Öffentliche Route für den Self-Service-Passwort-Reset.
//
// Supabase schickt aus resetPasswordForEmail einen Link mit
// type=recovery im URL-Hash; supabase-js verarbeitet das beim Laden
// und legt eine kurzlebige Recovery-Session an. Auf dieser Seite kann
// der Nutzer dann sein Passwort setzen.

import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BrandLockup } from "@/components/brand-lockup";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Passwort zurücksetzen · COCO" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // supabase-js verarbeitet den recovery-Hash automatisch.
    // Wir prüfen, ob wir tatsächlich eine Session haben.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setErr("Link ungültig oder abgelaufen.");
      }
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <p className="text-sm text-muted-foreground">Lade…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <BrandLockup size="lg" />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">Passwort zurücksetzen</h1>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Passwort wurde geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden.
            </p>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                await navigate({ to: "/auth" });
              }}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Zur Anmeldung
            </button>
          </div>
        ) : (
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
              setBusy(false);
              if (error) {
                setErr(error.message);
                return;
              }
              setDone(true);
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
        )}
      </div>
    </main>
  );
}