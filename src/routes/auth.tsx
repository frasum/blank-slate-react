// Login-Seite. Zwei Flüsse:
//   * E-Mail/Passwort — supabase.auth.signInWithPassword (primär)
//   * PIN-Terminal    — Server-Function validatePin → verifyOtp(magiclink)
//
// Vor jedem PIN-Login wird die bestehende Session per signOut beendet
// (Remix-Muster: kein "Anmelden über eine andere Session hinweg").
// Passwort-Reset läuft als Self-Service über Supabase-Mail
// (resetPasswordForEmail → /reset-password). Konten werden ausschließlich
// vom Admin angelegt — keine Selbstregistrierung.

import { useState } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { validatePin } from "@/lib/auth/auth-flows.functions";
import { BrandLockup } from "@/components/brand-lockup";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Anmelden · COCO" }, { name: "robots", content: "noindex" }],
  }),
  component: AuthPage,
});

type Tab = "password" | "pin";

function AuthPage() {
  const [tab, setTab] = useState<Tab>("password");
  const router = useRouter();
  const navigate = useNavigate();

  // Nach erfolgreichem Login redirect auf "/".
  const onLoggedIn = async () => {
    await router.invalidate();
    await navigate({ to: "/" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <BrandLockup size="lg" />
        <p className="text-center text-sm font-medium text-foreground">Anmelden</p>

        <div role="tablist" className="flex rounded-md border border-input p-1">
          {(["password", "pin"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t === "password" ? "Passwort" : "PIN"}
            </button>
          ))}
        </div>

        {tab === "password" && <PasswordForm onLoggedIn={onLoggedIn} />}
        {tab === "pin" && <PinForm onLoggedIn={onLoggedIn} />}
      </div>
    </main>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function PasswordForm({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  return (
    <div className="space-y-3">
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) {
          setErr("Anmeldung fehlgeschlagen");
          return;
        }
        await onLoggedIn();
      }}
    >
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="E-Mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        autoComplete="current-password"
        placeholder="Passwort"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <ErrorText message={err} />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Anmelden…" : "Anmelden"}
      </button>
    </form>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          disabled={resetBusy || !email}
          onClick={async () => {
            setResetMsg(null);
            setResetBusy(true);
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            setResetBusy(false);
            if (error) {
              setResetMsg("Konnte E-Mail nicht senden.");
              return;
            }
            setResetMsg(
              "Falls die Adresse existiert, ist eine E-Mail mit Reset-Link unterwegs.",
            );
          }}
          className="text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          Passwort vergessen?
        </button>
        {resetMsg && <span className="text-muted-foreground">{resetMsg}</span>}
      </div>
    </div>
  );
}

async function verifyMagicHash(tokenHash: string): Promise<boolean> {
  // Vor jedem PIN/Badge-Login bestehende Session beenden (Remix-Muster).
  await supabase.auth.signOut();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  return !error;
}

function PinForm({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const callValidatePin = useServerFn(validatePin);
  const [firstName, setFirstName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const { session_token_hash } = await callValidatePin({ data: { firstName, pin } });
          const ok = await verifyMagicHash(session_token_hash);
          if (!ok) throw new Error("verify failed");
          await onLoggedIn();
        } catch {
          setErr("Anmeldung fehlgeschlagen");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        type="text"
        required
        placeholder="Vorname"
        autoComplete="given-name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <input
        type="password"
        inputMode="numeric"
        required
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <ErrorText message={err} />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Anmelden…" : "Mit PIN anmelden"}
      </button>
    </form>
  );
}

function BadgeForm({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const callResolveBadge = useServerFn(resolveBadgeToken);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const { session_token_hash } = await callResolveBadge({ data: { token } });
          const ok = await verifyMagicHash(session_token_hash);
          if (!ok) throw new Error("verify failed");
          await onLoggedIn();
        } catch {
          setErr("Anmeldung fehlgeschlagen");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        type="text"
        required
        autoComplete="off"
        placeholder="Badge-Token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <ErrorText message={err} />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Anmelden…" : "Mit Badge anmelden"}
      </button>
    </form>
  );
}
