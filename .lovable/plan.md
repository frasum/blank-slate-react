## Status quo
`.prettierignore` deckt: `node_modules`, `dist`, `.output`, `.vinxi`, Lockfiles, `routeTree.gen.ts`, Supabase-Types, `.lovable/`.

`.gitignore` listet zusätzliche generierte/Build-/Tooling-Pfade, die Prettier aktuell mitformatieren würde, falls dort jemals matchbare Dateien landen.

## Zu ergänzen
Folgende Einträge **fehlen** in `.prettierignore` und sollen ergänzt werden (alle entweder generiert, von Tools verwaltet oder explizit kein Code):

```
# Build- & SSR-Output (zusätzlich zu dist)
dist-ssr/
.nitro/
.tanstack/
.wrangler/

# Lokale Env- & Daten-Dumps
.env
.env.*.local
.dev.vars
*.csv

# Coverage / Test-Artefakte
coverage/

# Logs
logs/
*.log

# Editor-Artefakte
.DS_Store
```

Begründungen kurz:
- `dist-ssr`, `.nitro`, `.tanstack`, `.wrangler` — Build- bzw. SSR-Output (Tanstack Start / Cloudflare).
- `.env*`, `.dev.vars`, `*.csv` — passend zur Projektregel „keine Personaldaten/CSVs im Repo" (Lektion thaitime); falls doch lokal vorhanden, nicht formatieren.
- `coverage/` — falls Vitest mal mit Coverage läuft.
- `logs/`, `*.log`, `.DS_Store` — pure Noise.

## Nicht ergänzt (bewusst)
- `supabase/migrations/*.sql` — SQL ist kein Prettier-Format, wird ignoriert.
- `.github/`, `.workspace/`, `public/` — enthalten Source/Konfigurationsdateien, die formatiert werden sollen.
- Eigene Glob-Negation für `routeTree.gen.ts` ist schon drin.

## Verifikation
Nach dem Patch einmal `bunx prettier --check .` ausführen — muss weiterhin grün sein.
