# PV1 — POS-Verkauf: Artikel-Verkaufsstatistik

Neuer Bereich unter **Bestellung → POS-Verkauf**. Zeigt Vectron-Artikelberichte je Standort in zwei Perioden (letzte 365 Tage · Gesamt), gefiltert über die drei VA2-Gruppenebenen. Import bleibt Frank-SQL (kein Upload-UI).

## Gemeldete Konflikte

1. **VA2-Filter existiert nicht als geteilte Komponente.** Die kaskadierende Hauptgruppe→Untergruppe→Warengruppe-Logik lebt heute inline in `bestellung.verkaufsartikel.tsx`. Entscheidung (freigegeben): **in `src/components/bestellung/SalesGroupFilter.tsx` extrahieren** und in beiden Seiten nutzen. Reiner struktureller Refactor, Verhalten unverändert (Options-Ableitung, Reset-Effekte, „__all__"-Sentinel bleiben 1:1).
2. **Migration.** Damit `types.ts` die neue Tabelle kennt (Regel „kein `any`"), führen wir die Migration hier via `supabase--migration` aus. Frank importiert danach mit seiner SQL parallel.

## Bauumfang

### 1) Migration — `sales_article_stats`

Exakt der Skizze folgend: Spalten, `unique(location_id, period, nummer)`, Index `(organization_id, location_id, period)`, `period`-CHECK auf `('d365','alltime')`. RLS aktiv, **DENY-ALL**-Policy, **keine** GRANTs für `anon`/`authenticated` — Zugriff nur über `supabaseAdmin` in Server-Fn (VA1-Muster). Kein FK auf `sales_articles`.

### 2) Server-Function — `src/lib/bestellung/sales-stats.functions.ts`

`listSalesStats` (POST, `requireSupabaseAuth` + `loadAdminCaller("manager")`):

- Input (Zod): `{ locationId: uuid, period: 'd365' | 'alltime' }`.
- `assertLocationInOrg` gegen Org des Aufrufers.
- Lädt parallel `sales_article_stats` (Kombi) und die Gruppenspalten aus `sales_articles` desselben Standorts.
- Reichert per reinem Helper `enrichSalesStats(stats, articles)` an: `hauptgruppe/-Nr`, `untergruppe/-Nr`, `warengruppe`, `productGroup` — alle `null`, wenn kein Treffer.
- Rückgabe: `{ rows, reportDate, unmatchedCount }` (`reportDate` = max, `unmatchedCount` = Zeilen ohne Match).
- Kein Schreibpfad.

### 3) Reine Module (mit Tests)

- `src/lib/bestellung/sales-stats.ts`
  - `normalizeName(s)` — `trim` + `toLocaleLowerCase("de")` + Whitespace-Kollaps.
  - `enrichSalesStats(stats, articles)` — Map über normalisierten Namen, gibt angereicherte Zeilen + `unmatchedCount` zurück.
  - `averagePriceCents(umsatzCents, count)` — `null` bei `count === 0`, negative Werte durchgereicht.
- Tests `src/lib/bestellung/sales-stats.test.ts`: Treffer, Miss (null-Gruppen), Namens-Normalisierung (Groß/Klein, Leerzeichen, Umlaute), `unmatchedCount`, Ø-Preis (0 / normal / negativ).

### 4) UI — neue Route `bestellung.pos-verkauf.tsx`

- Sub-Nav-Link in `bestellung.tsx` neben „Verkaufsartikel": „POS-Verkauf".
- `LocationPills` (Standort-Auswahl, Core-Regel PillSelect).
- Perioden-Tabs (`Tabs`): „Letzte 365 Tage" / „Gesamt (seit Aufzeichnung)".
- Neue **geteilte** `SalesGroupFilter`-Komponente (siehe Refactor unten): Hauptgruppe → Untergruppe → Warengruppe (Default „Alle") + zusätzlich Option **„Ohne Zuordnung"** auf Hauptgruppen-Ebene.
- Freitext-Suche (Nummer oder Name).
- Kopfzeile: Badge „Stand: `report_date`" (dt. Format); falls `unmatchedCount > 0` klickbares Hinweis-Badge „N Artikel ohne Gruppenzuordnung" → setzt Hauptgruppen-Filter auf „Ohne Zuordnung".
- Tabelle: Nr · Artikel · Warengruppe · Verkauft · Umsatz · Ø-Preis. Sortierbar per Spaltenklick, Default Umsatz absteigend. `de-DE`-Format, Cents→€ erst am Render, „—" wo `null`.
- Summenzeile über aktuelle Filterung (Stück + Umsatz).
- Leerer Zustand: ruhige Hinweiskarte „Noch keine POS-Verkaufsdaten importiert".

### 5) Refactor — `SalesGroupFilter` extrahieren

`src/components/bestellung/SalesGroupFilter.tsx`: nimmt eine Zeilenliste mit `hauptgruppe/-Nr, untergruppe/-Nr, warengruppe, productGroup` + Werte/Setter. Options-Ableitung und Reset-`useEffect`s werden 1:1 aus `bestellung.verkaufsartikel.tsx` verschoben. Prop `extraHauptOption?: { value; label }` für POS-Verkauf, um „Ohne Zuordnung" einzublenden — bei VA2 nicht gesetzt, also visuell/funktional identisch. `bestellung.verkaufsartikel.tsx` nutzt die Komponente danach; keine Verhaltensänderung. Snapshot-Regressions-Test der Options-Ableitung (`deriveGroupOptions`) als reines Modul.

### 6) Doku

`docs/arbeitsweise.md` → neuer Abschnitt **§PV1 — POS-Verkaufsstatistik**: Schema, Replace-Semantik je Standort × Periode, Frank-SQL-Import mit Vectron-Fußzeilen-Kontrollsumme, weicher Namens-Join (Merkposten: falls in der Praxis zu viele „Ohne Zuordnung", wäre `vectron_nr` auf `sales_articles` eine eigene kleine Folge-Welle). Modul-Status ergänzt.

## Nicht anfassen

`sales_articles`-Schema, VA1/VA2/VA3-Server-Fns/UI (nur lesend joinen). EKZ1, EasyOrder, Bestell-Kern, Kasse, Lohn, Zeit, Bilanz. Keine Edge-Fns, kein SMTP, kein localStorage. Geld bleibt `bigint cents`.

## Technische Anhänge

**Migration (Kern):**

```sql
create table public.sales_article_stats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  period text not null check (period in ('d365','alltime')),
  nummer int not null,
  name text not null,
  verkauf_count int not null default 0,
  umsatz_cents bigint not null default 0,
  report_date date not null,
  created_at timestamptz not null default now(),
  constraint sales_article_stats_unique unique (location_id, period, nummer)
);
create index sales_article_stats_org_loc_period_idx
  on public.sales_article_stats (organization_id, location_id, period);

grant all on public.sales_article_stats to service_role;
alter table public.sales_article_stats enable row level security;
create policy "sales_article_stats deny all"
  on public.sales_article_stats for all
  to authenticated, anon
  using (false) with check (false);
```

**Erfolgs-Gate:** `tsc --noEmit` 0 Fehler; `eslint src/ --max-warnings=5`; `prettier --check .`; `vitest run` komplett grün. Vor Commit: `prettier --write` + `eslint --fix` über geänderte Dateien.
