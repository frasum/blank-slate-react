# Code-Review 07/2026 — YAGNI / KISS / DRY / SOLID + Produktionsreife

**Stand:** 07.07.2026 · **HEAD-Bereich:** `37a8b8ac`–`a17dd3e1` · **Autor:** Chat-Review (unabhängige Instanz gemäß Gründungsdokument, Review-Loop).

Jede Aussage unten ist am Repo belegbar (Datei/Zeile, Migration, CI-Job).
Dieses Dokument ist die **Repo-Wahrheit** zum Review — der Kurzabriss + die
Merkliste stehen zusätzlich in `docs/arbeitsweise.md` §73.

---

## 1. Muss vor Produktivstart

### 1.1 Sentry-DSN + Testfehler-Probe — ✅ ERLEDIGT (07.07.2026)

- **DSN produktiv gesetzt** in den **Lovable-Secrets** desselben Projekts, in
  dem auch `MAILERSEND_API_KEY` liegt (siehe Secrets-Liste im Projekt-Panel:
  `SENTRY_DSN` neben `MAILERSEND_API_KEY`, `TELEGRAM_CRON_SECRET`, …).
  Kein `VITE_`-Build-Env, kein Wert im Repo.
- **Client-Init** über `getSentryClientConfig()` (Server-Fn,
  `src/lib/monitoring/sentry-config.functions.ts`) → `startSentryClient()`
  (`src/lib/monitoring/sentry-client.ts`). Ohne DSN passiert nichts.
- **Positiv-Probe:** manueller Envelope-`curl` gegen den DSN-Ingest-Endpoint
  mit Event-Quittung (Event-ID im Response, Eintrag im Sentry-Issue-Stream).
- **Negativ-Probe:** ein Finalize mit **Pool-Warnung** erzeugt bewusst
  **keinen** Alarm — die Warnung ist ein serverseitiger `throw new Error`
  mit definiertem Message-Match und wird vom Sentry-Filter absorbiert
  (Verhalten wie in `src/lib/monitoring/sentry.server.ts` beschrieben).

### 1.2 P3 Restore-Probe — OFFEN

- **Letzter Muss-Punkt** vor Cutover. Runbook-Gerüst:
  `docs/produktionsreife-review.md`, Abschnitt **G6**.
- Halbtags, ohne Lovable: Backup ziehen → auf zweite Supabase-Instanz
  restoren → Migration + Seed replayen → Read-Sonden gegen kritische
  Tabellen (Kasse, Zeit, Lohn).

### 1.3 Cutover-Gates — unverändert

- §5-Voll-Reimport der `tagesabrechnung`-Lücke, YUM-Anker (Mapping in
  `docs/arbeitsweise.md` Abschnitt 5).

---

## 2. Sollte bald

### 2.1 `.env`-Enttrackung + CI-Secret-Guard — ✅ ERLEDIGT (ENV1, `a17dd3e1`)

- `.env` aus dem Git-Tracking entfernt (Werte waren ausschließlich
  publishable/anon + domain-beschränkter Maps-Key → **kein History-Rewrite**
  nötig).
- CI-Guard in `.github/workflows/ci.yml` blockt Wieder-Committen **und**
  literale `*_KEY = "…"`-Zuweisungen in getrackten Dateien.
- Lokal aus `.env.example` neu befüllen (Werte aus Supabase-Projekt bzw.
  `supabase status`).

### 2.2 CI-`e2e`-Job auf blockierend heben — nach **10 grünen Läufen**

- Aktuell `continue-on-error: true` (wie `db-integration`, §8).
- Promotion-Kriterium: 10 aufeinanderfolgende grüne Läufe auf `main`.

### 2.3 HIBP-Toggle in Supabase-Auth bestätigen

- „Have I Been Pwned"-Prüfung in Supabase-Auth-Settings aktiv setzen und
  im Betriebs-Protokoll vermerken.

---

## 3. Kann später (kein eigener Sprint)

### 3.1 Groß-Dateien per Pfadfinderregel verschlanken

Nur bei Feature-Vorbeikommen anfassen — **kein Refactoring-Sprint**:

| Datei                                                 | Zeilen | Hinweis                                                        |
| ----------------------------------------------------- | -----: | -------------------------------------------------------------- |
| `src/routes/_authenticated/admin/zeit-uebersicht.tsx` |   2805 | funktionierend, gewachsen                                      |
| `src/routes/_authenticated/admin/bwa.tsx`             |   2468 | funktionierend                                                 |
| `src/components/verkaufsartikel/RezepteTab.tsx`       |   1486 | funktionierend                                                 |
| `src/routes/_authenticated/admin/kasse.tsx`           |   1294 | funktionierend, **E2E-versiegelt** (P2, `kasse-finalize.spec`) |

### 3.2 Geldformatierung konsolidieren

- Vier lokale Definitionen im Bestand; Zentral-Modul `lib/money` bei nächster
  passender Berührung schaffen. Kein Kandidat für einen Blocker.

### 3.3 Lohn-Einmalbezug-TODO

- **Geplant** als Stufe 2 des Lohn-Moduls (siehe M4-Roadmap in
  `docs/arbeitsweise.md`), kein offener Defekt.

---

## 4. Nicht anfassen — Risiko > Nutzen

- **`supabaseAdmin` in den drei token-gated Public-Routen** — ST1-
  dokumentierte Architektur (kein Session-Kontext, Token als Autorisierung),
  Umbau würde die Signaturkette invalidieren.
- **Generierte `any` (62 Fundstellen, ausschließlich `src/routeTree.gen.ts`)**
  — TanStack-Router-Generat, wird bei Route-Änderung neu erzeugt.
  Handgeschriebener Code: **0 `any`, 0 `ts-ignore`, 0 `console.log`**
  (mit `rg` verifiziert).
- **Trinkgeld-Formel** — genau eine Definition (`computeSessionTipPoolCore`,
  `src/lib/cash/tip-pool.ts`), acht Verwender inkl. Statistik-Reuse (S-7).
  KGL gelebt.
- **Kein Git-History-Rewrite** wegen der historisch getrackten `.env`
  (nur publishable/anon-Werte + domain-beschränkter Maps-Key,
  siehe ENV1-Analyse).
- **Keine SaaS-Strukturumbauten vor Kassen-Go-live** —
  `docs/saas-vorbereitung.md` bleibt Notizsammlung, nicht Sprint.

---

## 5. Gesamturteil

**Struktur gesund.** Die Hausregeln (KGL/BIGINT-Cents/reine Module/Review-
Loop/„melden statt still lösen") sind die operative Form von
YAGNI/KISS/DRY/SOLID in diesem Repo — Prinzipien sind gelebt, nicht
deklariert. **Restarbeit ist Betrieb, nicht Architektur** — nach P3
Restore-Probe steht dem Cutover nichts entgegen.

---

## 6. Nachtrag 07.07.2026 — ENV1-Ausnahme für Publish-Build

**Symptom (07.07.):** `cocoplatform.online` zeigt „Seite konnte nicht
geladen werden". Ursache: der Publish-Build enthielt kein
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` mehr, weil die
zuvor getrackte `.env` mit ENV1 aus dem Repo entfernt wurde. Vite
inlined `import.meta.env.VITE_*` **zur Build-Zeit** aus dem Repo-Stand
— server-seitige Lovable-Secrets erreichen den Client-Bundle nicht.

**Meldung statt stiller Lösung (Hausregel):** Die ENV1-Enttrackung war
korrekt für alles außer den beiden reinen Publishable-Werten. Diese
werden ab jetzt bewusst als _eigene_ Datei eingecheckt, die
ENV1-Grundregel „keine Secrets im Repo" bleibt unangetastet.

**Umsetzung:**

- Neue Datei `.env.production` mit ausschließlich publishable Werten:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID`, `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_*`
  (Browser-Key ist domain-beschränkt).
- `.gitignore` erhält `!.env.production` als expliziten Whitelist-Eintrag
  mit Kommentar.
- **Keine Secrets** in `.env.production` — SERVICE_ROLE_KEY, DSNs,
  API-Tokens etc. bleiben ausschließlich in Lovable-Secrets. Der
  CI-Guard („keine .env im Git, keine Secrets in getrackten Dateien",
  `.github/workflows/ci.yml`) greift weiter für `.env` und
  SERVICE_ROLE/SECRET/PRIVATE_KEY-Muster.

**Modul-Status:**

- **ENV1 .env-Enttrackung + CI-Guard** — ✅ bleibt gültig; ergänzt um
  dokumentierte Ausnahme `.env.production` für Publishable-Only-Werte.

**Nach Publish neu prüfen:** `cocoplatform.online` lädt bis
Login-Screen, Supabase-Requests gehen mit anon-Key raus, Sentry-Envelope
ohne Pool-Warnung.
