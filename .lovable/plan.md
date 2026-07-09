## Problem

Die Preview-Seite zeigt „Diese Seite konnte nicht geladen werden". Console-Log:

```
[Supabase] Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
```

Ursache:
- `src/integrations/supabase/client.ts` liest im Browser `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` und **wirft**, wenn beide fehlen.
- Vite ersetzt diese Werte **zum Build-Zeitpunkt** aus der passenden `.env`-Datei.
- Preview-Deploys werden mit `build:dev` (Mode = `development`) gebaut → geladen wird `.env` (+ ggf. `.env.development`), **nicht** `.env.production`.
- Aktuelle `.env` enthält nur die Google-Maps-Keys, keine Supabase-Werte. Deshalb ist der Client im Preview-Bundle „nackt", wirft beim ersten Zugriff (z. B. in `_authenticated`), TanStack fängt es in der Root-Error-Boundary und zeigt die Fallback-Seite.
- Der Produktions-Deploy (`cocoplatform.lovable.app`) ist nicht betroffen, weil `.env.production` die Werte enthält.

## Fix (ein einziger Schritt)

`.env` um die beiden fehlenden `VITE_SUPABASE_*`-Variablen ergänzen — Werte 1:1 aus `.env.production` übernehmen. Danach wird der Preview-Build automatisch neu gebaut und die Seite lädt wieder.

Nichts am Code, nichts am Fehler-Handling ändern — der bestehende Error-Boundary hat seinen Job korrekt gemacht.

## Technische Details

- Datei: `.env` (Repo-Root)
- Hinzufügen (Werte aus `.env.production` spiegeln):
  - `VITE_SUPABASE_PROJECT_ID`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Publishable-Key ist explizit öffentlich (RLS aktiv), darf im Repo stehen — konsistent mit `.env.production`, die dort bereits eingecheckt ist.
- Kein Server-Code, keine Migration, keine Tests betroffen.

## Warum kein Code-Fix?

Man könnte den Client so umbauen, dass er im Fehlerfall lautlos einen No-Op-Proxy liefert — das würde die Symptome verstecken und alle Supabase-Aufrufe stumm scheitern lassen. Der aktuelle „laut werfen"-Ansatz ist richtig; der Fix gehört in die fehlende Konfiguration.
