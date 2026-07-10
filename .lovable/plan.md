## Beide Punkte — Status und Auslieferung

### Punkt 1 — Cron-SQL als Vorab-Skizze (nicht via Lovable-DB-Werkzeug)

Bestätigt: Die Cron-Route zeigt bereits auf den Custom-Domain-Pfad `/api/public/bank/sync-spicery` mit `x-cron-secret`-Header und Timing-safe-Compare. Was noch fehlt, ist die SQL-Skizze — die liefere ich als Chat-Ausgabe, du führst sie selbst im Supabase-Editor aus.

Skizze (Platzhalter `<CRON_SECRET>` durch den Wert aus dem Supabase-Vault ersetzen — steht dort schon):

```sql
-- BK2 — Täglicher Bank-Sync Spicery, 06:00 Europe/Berlin (=04:00 UTC im Sommer, 05:00 im Winter).
-- pg_cron läuft in UTC; wir wählen 05:00 UTC als Kompromiss (dt. 06:00 bzw. 07:00).
-- Voraussetzung: extensions pg_cron und pg_net sind aktiv.

select cron.schedule(
  'bk2-sync-spicery-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url    := 'https://cocoplatform.online/api/public/bank/sync-spicery',
    headers:= jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body   := '{}'::jsonb
  ) as request_id;
  $$
);
```

Rollback:
```sql
select cron.unschedule('bk2-sync-spicery-daily');
```

### Punkt 2 — Mapper-Randfall (transactionId + internalTransactionId beide leer)

Bereits erledigt in der aktuellen Codebasis — Bestandsprüfung im Plan-Modus (kein Fund/kein Fix nötig):

- `src/lib/bank/gocardless-map.ts` Zeilen 6-9 dokumentieren die Regel im Header-Kommentar, Zeilen 89-93 implementieren sie: leerer `externalTxId` → `skippedNoId++; continue;` — die Zeile wird nie mit NULL-ID geschrieben.
- `src/lib/bank/gocardless-map.test.ts` Zeilen 39-58 enthalten den passenden Testfall („überspringt Zeilen ohne transactionId UND ohne internalTransactionId"): zwei booked-Zeilen, eine ohne beide IDs, eine mit `internalTransactionId` — erwartet `skippedNoId === 1` und `rows.length === 1`.

Nichts weiter zu bauen. Wenn du möchtest, kann ich beim Build in §84 einen Halbsatz nachziehen, der Cron-Skizze + Mapper-Randfall aktenkundig macht — sag Bescheid, ob das mit rein soll.

### Was der Plan im Build-Modus ausführt

1. Diese Cron-SQL-Skizze wörtlich in einer Chat-Nachricht an dich ausliefern (kein DB-Tool, kein `supabase--insert`).
2. Optional: `docs/arbeitsweise.md` — Kurzeintrag §84 mit den zwei Punkten (Cron-Domain-Korrektur, Mapper-Randfall bestätigt). Nur wenn du zustimmst.
3. Keine weiteren Codeänderungen — Mapper und Test sind bereits konform.