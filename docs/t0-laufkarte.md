# T0-LAUFKARTE — Umschalttag Samstag, 26.07.2026

Drehbuch für Frank. Reihenfolge einhalten; jeder Schritt nennt Ort, Datei, Erwartung.
**Generalprobe: Di 22.07.** (beschlossen 15.07.): Laufkarte physisch durchgehen —
Block 2 nur bis 2.5 (KEIN Commit), Block 3 komplett (= Wochen-Parallel-Vergleich),
Block 4 nur 4.1 (KEINE Löschung), Blöcke 1/5/6 nur lesen. Zeit stoppen.
G6: komplette native_overlap-Liste wird am 22.07. voll geprüft (Eichung).

Bei JEDER unerwarteten Zahl: STOPP, Ergebnis in den Chat, Prüfer-Diagnose abwarten —
kein Weiterwursteln (Abbruchkriterien E5, §98). Zeitbedarf gesamt: ~1,5–2 h.

## Vorabend (Fr 25.07.)

- [ ] **V1 — Team-Ansage:** Heute letzte Stempelungen/Einträge im Altsystem; ab morgen gilt nur noch COCO. Offene Stempelungen vor Feierabend schließen.
- [ ] **V2 — Publish-Stand prüfen:** COCO-Build aktuell published, CI grün (kein offener Migrations-Merge ohne Publish — §87-Kopplung).

## T0-Vormittag (Sa 26.07., NACH 03:00 Uhr — Geschäftstags-Cutoff)

### Block 1 — Kassen-Teil einfrieren (~10 min)

- [ ] **1.1** Team-Bestätigung: keine laufenden Stempelungen mehr im Altsystem (Kassen-/Abrechnungsteil).
- [ ] **1.2** Read-only-Vermerk im Altsystem hinterlassen (Notiz/Banner): „Kassen-/Abrechnungsteil eingefroren 26.07.2026 — alle Erfassung ab jetzt in COCO (cocoplatform.online)".
- [ ] **1.3** Ab jetzt: KEINE Schreibvorgänge mehr im Kassen-/Abrechnungsteil von tagesabrechnung. (Endgültige Stilllegung folgt Ende Juli separat.)
- [ ] **1.4** Zeiterfassung läuft im Altsystem als Zweitschrift bis 31.07. weiter (G4); Alt-Zeit-Einträge ab 26.07. werden NIE importiert — reines Vergleichsmaterial.

### Block 2 — Zeit-Import: Export → Dry-Run → COMMIT (~30 min)

- [ ] **2.1** → TAGESABRECHNUNG-Editor. Selbsttest: `SELECT count(*) FROM restaurants;` (eine Zahl = richtiges Projekt).
- [ ] **2.2** Sanity: `export-schritt1-sanity-TAGESABRECHNUNG.sql` → **quelle = export**, sonst STOPP.
- [ ] **2.3** Export: `export-schritt2-zeitexport-TAGESABRECHNUNG-v2.sql` → Download CSV. Zeilenzahl = Sanity-Zahl.
- [ ] **2.4** → COCO `/admin/migration`: CSV hochladen → **„Identitäten vorschlagen"** → JEDEN neuen Namen bestätigen oder bewusst ablehnen (bis nichts Unbestätigtes bleibt — R2-Lektion GIG SERVICE).
- [ ] **2.5** **Dry-Run** → Zahlen in den Chat. Prüfer-Freigabe abwarten. Erwartungsstruktur (§97): Bilanz `gelesen = importiert + absence + invalid_time + duplicate` · `unmapped_staff` fehlt/0 · `existingKeyCount` = Live-Count · importiert ≈ Neuzugänge seit 14.07. (Referenz 15.07.: 249; wächst um ~18/Tag).
- [ ] **2.6** Nach Freigabe: **COMMIT** ausführen → **Run-ID und Wasserlinie notieren** (Wasserlinie = höchster importierter Geschäftstag = 25.07.).
  - Hinweis (E-Q5b/G5): Der Import ist Verifikation + Lückenschluss für COCO — die Juli-LOHNQUELLE bleibt das Altsystem; Juli-Korrekturen nach dem T0 erfolgen NUR dort (Disziplin-Regel), Drift fängt der 31.07.-Abgleich.
- [ ] **2.7** **Re-Import-Probe:** dieselbe CSV erneut als Dry-Run → `importiert = 0`, alles duplicate. Sonst STOPP (Abbruchkriterium 4).
- [ ] **2.8** Wasserlinie zurücksetzen (G1): Der Importer setzt sie beim Commit automatisch — direkt danach per bereitliegendem SQL (`t0-wasserlinie-null-COCO.sql`) auf NULL zurücksetzen. Es bleibt bewusst KEIN Tag gesperrt; Sperren übernimmt später die Perioden-Systematik.

### Block 3 — Kassen-Verifikationslauf (~20 min, §98: KEIN Import!)

- [ ] **3.1** → TAGESABRECHNUNG-Editor: `kasse-export-0` (Sanity-Zahlen sichern) → `kasse-export-1/2/3` (je Download CSV).
- [ ] **3.2** → COCO-Editor: `kasse-gegenexport-COCO.sql` → Download CSV.
- [ ] **3.3** Alle 5 Ergebnisse in den Chat → Prüfer-Diagnose. **Erwartung: NULL Differenzen ≤ 01.07.**; Quell-Zeilen 02.–25.07. sind obsolete Zweitschrift (wird dokumentiert, NICHT importiert). Differenz ≤ 01.07. = STOPP (Abbruchkriterium 1).

### Block 4 — Testdaten-Bereinigung (~10 min)

- [ ] **4.1** → COCO-Editor: `t0-testdaten-1-beweis-COCO.sql`. Erwartung: 44 / 363 / 0 / ≥9 / carts / items (Probe 15.07.: 44/363/0/9/8/1). **Mehr als 44 Bestellungen → STOPP**, Detail-Liste in den Chat (mögliche echte unversendete EasyOrder-Bestellung).
- [ ] **4.2** Nach Prüfer-OK (bzw. bei exakter Erwartung direkt): `t0-testdaten-2-loeschen-COCO.sql` — ein Lauf, Transaktion + Rest-Check zusammen (§10). Erwartung: 0 / 0 / 0 / 0 / echte unverändert.

### Block 5 — Betriebsstart-Anker (~15 min)

- [ ] **5.1** **Tresor-Anker (E4):** Tresor-/Kassenbestand je Standort ZÄHLEN (YUM zuerst, dann Spicery) und in COCO als Anfangsbestand eintragen (Tresor-Funktion). Gezählte Beträge zusätzlich hier im Chat notieren (Vier-Augen-Beleg).
- [ ] **5.2** **Bestell-Testmodus umschalten** (Config-Check-Seite) → Echtversand aktiv; beim nächsten echten Versand `order_email_log`-Eintrag kontrollieren.

### Block 6 — Abschluss (~10 min)

- [ ] **6.1** **Abbruchkriterien-Check** (alle fünf müssen bestanden sein): ① Kassen-Verifikation 0 Differenzen ≤ 01.07. ② Zeit-Bilanz-Invariante erfüllt ③ Wasserlinie = NULL verifiziert (G1) ④ Re-Import-Probe importiert = 0 ⑤ native_overlap-Stichprobe (erste 20) ohne einen einzigen falschen Skip — Referenz: Voll-Eichung der Liste bei der Generalprobe 22.07. (G6); EIN nachgewiesen falscher Skip = STOPP.
- [ ] **6.2** Kurze Meldung in den Chat: „T0 vollzogen" + die notierten Werte (Run-ID, Wasserlinie, Tresor-Beträge) → Prüfer schreibt §102-Doku-Nachzug.

## Nachlauf (ab 27.07., kein T0-Stress)

- [ ] **N1** Erste echte COCO-only-Tage beobachten; bei Auffälligkeiten sofort melden.
- [ ] **N1a — Zeit-Vollständigkeit Vortag (täglich, ~30 s):** Fall-1-Abfrage im Supabase-Editor — alle Service-Pool-Zeilen des Vortags müssen `shift_end` UND irgendeinen `time_entries`-Eintrag (beliebige source, NICHT auf 'pool' filtern!) haben. Null Zeilen = ok; jede Treffer-Zeile ist ein Einspringer ohne Zeiten → sofort in der Kassen-UI nachtragen. Abfrage: siehe §105 PZ1 / Prüfer-Chat 18.07.

  ```sql
  select se.business_date, l.name as standort, st.display_name as person,
         pool.shift_start, pool.shift_end
  from session_tip_pool_entries pool
  join sessions se on se.id = pool.session_id
  left join locations l on l.id = se.location_id
  join staff st on st.id = pool.staff_id
  where pool.department = 'service'
    and se.organization_id = '77838674-26c1-40dd-9b74-eb1041e79b95'
    and se.business_date = current_date - 1
    and (pool.shift_end is null
         or not exists (select 1 from time_entries te
                        where te.staff_id = pool.staff_id
                          and te.business_date = se.business_date))
  order by l.name, st.display_name;
  ```
- [ ] **N1b** 31.07. — Finaler Zeit-Abgleich (G4/G5): Alt-Export 26.–31.07. + Juli-Spätkorrekturen gegen COCO (Prüfer-Diagnose); Differenzen aus Juli-Spätkorrekturen gezielt per Manager-Korrektur in COCO nachtragen; danach Stilllegung freigegeben.
- [ ] **N2** Finale Export-CSVs verschlüsselt EXTERN archivieren (nicht Repo, nicht Projekt-Storage).
- [ ] **N3** Aufräum-Migrationen beauftragen (Prüfer liefert Prompts): `sessions.opentabs_deduction_cents` (N15b) + `count_holidays_as_leave` (UZ1) droppen.
- [ ] **N4** Endgültige Stilllegung tagesabrechnung (Ende Juli, dein Termin): Alt-Syncs/Cron aus, Projekt pausieren/archivieren.

## Abbruch-Pfad (falls ein Kriterium reißt)

Nichts weiter ausführen · betroffenen Block dokumentieren (Screenshots/CSVs in den Chat) · COCO läuft normal weiter (kein Rollback nötig — alle T0-Schritte vor dem Fehlerpunkt sind einzeln rücknehmbar bzw. harmlos: Zeit-Import ist idempotent, Löschung nur nach bestandenem Beweis) · neuer Anlauf nach Diagnose, notfalls am 27.07. — die Periodengrenze verschiebt sich dadurch nicht.
