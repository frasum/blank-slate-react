# Frag COCO — Lücken-Kartierung

Stand: 10.07.2026. Grundlage: 17 aktuell verdrahtete Tools in
`src/lib/ki/tools.ts` und der Dispatcher in
`src/lib/ki/tool-dispatcher.server.ts`. Ziel dieses Dokuments: **keine**
Implementierung, sondern eine ehrliche Bestandsaufnahme, an welchen Fragen
COCO heute scheitert oder zu grob antwortet — und woran das liegt.

Regel bleibt: Vor jedem KI-Aufruf werden Personendaten zu MA-Codes
(MA-1, MA-2 …) pseudonymisiert und in der Antwort zurückgetauscht. Alles,
was hier als „Lücke" auftaucht, muss diese Regel weiterhin erfüllen —
andernfalls landet die Frage bewusst nicht im Tool-Set.

---

## 1. Modul → vorhandenes Tool → offene Fragen

| Modul                                                                                      | Deckt heute ab                                                                                                  | Typische Fragen ohne Antwort                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kasse / Session** (`src/lib/cash/`)                                                      | `kasse_tagesabschluss` (Umsatz, Ausgaben, Karten, Bank, Tresor, Gutscheine, Gäste, Sessions pro Zeitraum)       | – Zweitkellner-Abrechnungen (`waiter_settlements`): wer hatte wie viele Sessions, wieviel Cash-/Karten-Anteil?<br>– Barentnahmen nach Zweck (`session_expenses.category`)<br>– Offene Rechnungen mit Gastnamen (aggregiert: „wieviel offen, wie alt, welcher Standort")<br>– Bank-Einzahlungs-Rhythmus / offene Tresorbeträge über Zeit        |
| **Trinkgeld** (`src/lib/cash/tip-*`, `session_tip_pool_entries`)                           | Teilaggregat in `kasse_tagesabschluss` (Summe), Statistik-UI separat                                            | – Trinkgeld pro Standort, Servicezeit, Küche vs. Service<br>– Ø Trinkgeld pro Servicestunde<br>– Restbeträge / nicht verteiltes Trinkgeld (`trinkgeld-rest`)                                                                                                                                                                                   |
| **Lohn / Payslips** (`src/lib/lohn/`, `src/lib/payslips/`)                                 | Nichts direkt. `personalkosten_quote` ist Näherung ohne SFN/AG-Anteil                                           | – Lohnkosten je Monat pro Standort inkl. SFN (aggregiert, nicht pro Person)<br>– SFN-Anteil an der Lohnsumme<br>– Provisionsspitzen pro Monat<br>– Wiederkehrende Zeilen (`lohn_recurring_zeilen`): Summe, Zweck-Verteilung<br>– Krank-Tage aus `lohn_absence_days` (unabhängig von `roster_absence`)                                          |
| **Bestellung / Wareneinkauf** (`src/lib/bestellung/`)                                      | `bestellungen_zeitraum` (Anzahl, Summe pro Lieferant, Status)                                                   | – Artikelebene: welche Artikel/Warengruppen wurden wieviel bestellt?<br>– Preisentwicklung pro Artikel<br>– Lieferanten-Vergleich (Ø Lieferzeit, Storno-Quote)<br>– Warenkorb-Entwürfe (`cart_drafts`) — was ist unverschickt liegen geblieben und wie lange?                                                                                  |
| **Inventur** (`inventory_sessions`, `inventory_items`)                                     | `inventur_aktuell` (letzter Wert pro Standort, Datum, Artikelzahl)                                              | – Inventurdifferenz zur Vorwoche/Vor-Inventur (Schwund/Zugang)<br>– Wareneinsatz aus Inventur + Wareneinkauf − Endbestand als eigener Wert<br>– Top-Positionen nach Wert je Inventur                                                                                                                                                           |
| **Dienstplan** (`src/lib/roster/`)                                                         | `dienstplan_geplant` (Schichten pro Bereich/Servicezeit), `abwesenheiten`, `tausch_anfragen`, `urlaub_antraege` | – **Geplante vs. tatsächliche Stunden** (Delta pro Woche)<br>– Freigabestatus Dienstplan (`roster_releases`): welche Wochen sind veröffentlicht?<br>– Wünsche/Verfügbarkeiten (`day_off_wishes`, `roster_availability`): Erfüllungsquote<br>– Ruhetage-/Feiertagsverstöße (Kollision mit `location_rest_days`, `location_calendar_exceptions`) |
| **Zeiterfassung** (`src/lib/time/`)                                                        | `arbeitsstunden` (Netto, pro Standort/Abteilung)                                                                | – Pausenzeit-Analyse (Ø Pause pro Schicht)<br>– Nachträglich korrigierte Buchungen (Audit)<br>– Stempelversäumnisse (Schicht geplant, kein Time-Entry)                                                                                                                                                                                         |
| **Aufgaben / Kanban** (`src/lib/aufgaben/`)                                                | `aufgaben_status` (Zählungen offen/laufend/erledigt, überfällig)                                                | – Aufgaben pro Verantwortliche(r) (pseudonymisiert)<br>– Durchlaufzeit (created→done)<br>– Rückstände nach Kategorie über Zeit (Trend, nicht Snapshot)<br>– Foto-Nachweise: wieviele Aufgaben mit/ohne Beleg                                                                                                                                   |
| **Verkaufsartikel & Rezepte** (`src/lib/pos/`, `recipes`, `recipe_items`)                  | `getraenke_ranking` (nur Getränke, Snapshot d365/alltime)                                                       | – Rangliste **Speisen** (heute nur Getränke)<br>– Verkaufsstunden-Verteilung (`sales_pos_group_overrides`, `pos_hourly_stats`) — Peak-Stunden pro Warengruppe<br>– Deckungsbeitrag: Rezept-Wareneinsatz × Verkaufszahl (braucht Verknüpfung Rezept↔Artikel)                                                                                    |
| **Statistik-Auswertungen** (`src/lib/statistics/`)                                         | Teilweise via `umsatz_zeitraum` und `kasse_tagesabschluss`                                                      | – Standortvergleich als Tool (STAT-U3 existiert in UI, aber nicht als KI-Tool)<br>– Umsatzentwicklung mit 3 Serien (STAT-U2)<br>– Takeaway-Kanal-Verteilung                                                                                                                                                                                    |
| **BWA / Bilanz** (`src/lib/bwa/`, `bilanz_*`)                                              | `bwa_monat`, `bilanz_summen`                                                                                    | – BWA-Vergleich Monat vs. Vorjahresmonat<br>– YTD-Auflauf<br>– Bilanz-Detailpositionen (heute nur Level 1)                                                                                                                                                                                                                                     |
| **Sofortmeldung** (`src/lib/sofortmeldung/`)                                               | Nichts                                                                                                          | – **Bewusst nicht**: enthält Klarnamen, SV-Nummern → gehört nicht ins KI-Tool. Falls überhaupt, dann streng aggregiert („X offene Sofortmeldungen").                                                                                                                                                                                           |
| **Personalstamm** (`src/lib/admin/staff.*`, `staff_personal_details`)                      | `personal_bestand` (Zählungen, Verteilung)                                                                      | – **Bewusst nicht personenbezogen**. Möglich: Vertragsart-Verteilung (Minijob/Teilzeit/Vollzeit), Ø Betriebszugehörigkeit, offene Datenänderungsanträge (`staff_data_change_requests`)                                                                                                                                                         |
| **Skills / Qualifikationen** (`skills`, `staff_skills`)                                    | Nichts                                                                                                          | – Skill-Abdeckung pro Standort/Bereich („wieviele mit Skill X pro Standort")<br>– Lücken: Standorte ohne Mindestbesetzung eines Skills                                                                                                                                                                                                         |
| **Dokumente** (`src/lib/dokumente/`, `staff_documents`)                                    | Nichts                                                                                                          | – Anzahl fehlender Pflichtdokumente pro Standort (Führungszeugnis, Belehrung §43 IfSG etc.), aggregiert                                                                                                                                                                                                                                        |
| **Migration / Import** (`src/lib/migration/`, `import_runs`)                               | Nichts                                                                                                          | – Statusübersicht letzte Importläufe (Fehler, Zeilen)                                                                                                                                                                                                                                                                                          |
| **Telegram / TRMNL / Display** (`src/lib/telegram/`, `src/lib/trmnl/`, `src/lib/display/`) | Nichts                                                                                                          | – Operativ, kein KI-Bedarf. Bewusst weglassen.                                                                                                                                                                                                                                                                                                 |
| **Wein-Quiz** (`wine_quiz_scores`)                                                         | Nichts                                                                                                          | – Rangliste Quiz-Ergebnisse (pseudonymisiert). Nice-to-have.                                                                                                                                                                                                                                                                                   |
| **Branchenreferenz**                                                                       | `branchenbenchmark_lookup` (Vollgastronomie DE, DEHOGA)                                                         | – Weitere Segmente (Bar/Café, Systemgastro) — falls Vergleiche relevant<br>– Regionale Werte                                                                                                                                                                                                                                                   |

---

## 2. Zu grob: bestehende Tools mit Nachschärfungs-Bedarf

- `umsatz_zeitraum`: liefert Haus/Takeaway-Split, aber **keine Servicezeit** (mittag/abend), **keinen Zahlungsweg-Split** (Bar/Karte/Gutschein). Für viele Fragen der eigentliche Blocker.
- `personalkosten_quote`: dokumentiert selbst, dass SFN und AG-Anteil fehlen. Solange kein Lohn-Tool existiert, bleibt es eine grobe Näherung.
- `getraenke_ranking`: **nur Getränke, kein Zeitraum-Fenster** (d365 oder alltime). Für „was lief letzten Monat" nicht ausreichend.
- `dienstplan_geplant`: zählt Schichten, **keine Stunden**. Delta zu Ist ist damit nicht rechenbar.
- `aufgaben_status`: Snapshot, **keine Historie**.
- `bwa_monat` / `bilanz_summen`: keine Vergleichszeiträume, keine Tiefengliederung.

---

## 3. Datenschutz-Grenzen (was NICHT ins Tool-Set gehört)

- **Sofortmeldung-Rohdaten** (SV-Nummer, Klarname): nie an die KI.
- **Lohnhöhe pro Person**: aggregiert (Standort/Monat) ok, personenbezogen nicht — auch nicht pseudonymisiert, weil sich in einem kleinen Team die Zuordnung leicht raten lässt.
- **Adressen/Kontakte** aus `staff_personal_details`: nie.
- **Freitext-Kommentare** (Payroll-Notes, Task-Beschreibungen mit Personenbezug): nur Zählungen, kein Volltext.
- **Auditlog**: nur aggregierte Zählungen, keine Vorgangsdetails.

Faustregel: wenn ein Wert nur für ≤ 3 Personen aussagekräftig ist, ist er praktisch personenbezogen — dann aggregieren oder weglassen.

---

## 4. Priorisierung

**A — hoher Nutzen, kleines Schema-Risiko, in einem Rutsch machbar**

1. `umsatz_zeitraum` erweitern: Servicezeit-Split + Zahlungsweg-Split (Bar/Karte/Gutschein/Takeaway-Kanal). Datenquelle liegt bereits in `sessions` + `session_channel_amounts` + `session_card_transactions`.
2. **Speisen-Ranking** analog `getraenke_ranking` (Snapshot d365/alltime), Filter auf Nicht-Getränke-Warengruppen.
3. **Bestellungen auf Artikelebene** (`bestellungen_artikel`): Top-Artikel/Warengruppen pro Zeitraum aus `order_items`.
4. **Trinkgeld-Aggregat** (Pool + Rest) pro Zeitraum/Standort/Servicezeit — Statistik-Logik existiert bereits in `src/lib/statistics/tip-aggregate.ts`.

**B — mittlerer Nutzen, etwas Aufbau**

5. **Dienstplan geplant vs. Ist** (Stunden-Delta): braucht Stundenschätzung aus Schichten (Servicezeit-Länge) und Vergleich mit `time_entries`.
6. **Inventurdifferenz** (Vor-/Nach-Vergleich, Schwund-Kennzahl).
7. **Skill-Abdeckung pro Standort** (rein aggregiert).
8. **Lohn-Aggregat pro Monat/Standort** inkl. SFN — nur Summen, keine Personenwerte.
9. **BWA-Vergleich** Monat vs. Vorjahr / YTD (kleiner Aufsatz auf `bwa_monat`).

**C — nice-to-have, später**

10. Aufgaben-Historie (Durchlaufzeit, Rückstands-Trend).
11. Bestellungs-Preisentwicklung pro Artikel.
12. Wein-Quiz-Rangliste.
13. Fehlende Pflichtdokumente (Zählung).
14. Import-Runs-Status.

**Bewusst NICHT geplant**

- Sofortmeldung, Payroll-Notes-Volltext, Personalstamm-Details, Telegram/TRMNL-Interna.

---

## 5. Nächster Schritt

Du wählst aus der A-Liste, was zuerst ins Tool-Set wandert. Jede Erweiterung wird ein eigener kleiner Bauplan-Schritt: Tool-Definition in `src/lib/ki/tools.ts`, Handler in `tool-dispatcher.server.ts`, Vitest, Doku-Nachzug in `docs/arbeitsweise.md`. Wenn nach mehreren Erweiterungen die Toolzahl deutlich über ~25 steigt, prüfen wir das Tool-Deferral-Muster (Meta-Tool `tool_search` + `tool_invoke`), damit der System-Prompt nicht überläuft.
