## Warum du das siehst

- **Published (`cocoplatform.online`)** liest die Supabase-Werte aus `.env.production` — die Datei ist im Repo eingecheckt (bewusste Ausnahme zu ENV1, dokumentiert in `docs/code-review-2026-07.md`). Deshalb baut die Produktion sauber → Login-Screen erscheint.
- **Live-Preview** baut in der Lovable-Sandbox. Dort gilt `.env.production` **nicht** (Vite liest sie nur bei `mode=production`). Die Sandbox braucht ein `.env` — und das ist per `.gitignore` ausgeschlossen und aktuell **nicht vorhanden** (`ls -la .env*` zeigt nur `.env.example` und `.env.production`). Ohne `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` wirft `src/integrations/supabase/client.ts` beim ersten Zugriff → deine freundliche Fehlerseite „Konfiguration unvollständig".

Genau dieselbe Ursache wie am 09.07. schon einmal — die Sandbox wurde seither neu aufgesetzt, das damals angelegte `.env` ist mit weg.

## Fix (minimal)

Ein `.env` in der Sandbox anlegen mit den drei publishable Werten aus `.env.production`:

```
VITE_SUPABASE_PROJECT_ID=gyvblrdhutztbkoynnrq
VITE_SUPABASE_URL=https://gyvblrdhutztbkoynnrq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key aus .env.production>
```

Danach Dev-Server neu starten. Kein Code-Change, keine Repo-Änderung (`.env` bleibt in `.gitignore`), Published verhält sich unverändert.

## Was ich NICHT anfasse

- `.env.production`, `client.ts`, Fehlerseite, Auth-Flow — alles korrekt, kein Bug.
- Keine Secrets in git, keine Änderung an Doku/CI.

## Nach dem Fix

Preview zeigt wieder den Login-Screen wie Published. Wenn die Sandbox erneut neu aufgesetzt wird, kommt derselbe Zustand zurück — ehrlich benannt: das ist ein wiederkehrender Sandbox-Reset-Effekt, kein App-Fehler.