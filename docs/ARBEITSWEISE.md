Arbeitsweise & Stammdaten-Referenz — COCO

Schlankes Betriebshandbuch für die laufende Entwicklung. Wird bei jedem neuen Baublock konsultiert. Bewusst kurz gehalten — Architektur-Begründungen stehen im gruendungsdokument.md, nicht hier.

Stand: 14.06.2026

1. Rollenverteilung im Team

Drei Rollen, klar getrennt:

Lovable Agent = Baumeister. Schreibt Code, Migrationen, UI auf Basis eines präzisen Prompts. Committet nach main.

Claude = Architekt / Prüfer. Schreibt die Prompts (mit „Nicht anfassen"-Liste und Erfolgs-Gate), prüft jeden Commit via git fetch + Tests + ESLint, gibt Migrations-Vorab-SQL aus.

Frank = entscheidet & führt SQL aus. Gibt Prompts an Lovable, genehmigt, führt alle SQL-Statements selbst im Supabase-Editor aus (Datenhoheit).

Begründung: Bei einem System mit Geld, Arbeitszeit und RLS sind stille Fehler teuer. Die Dreiteilung erzwingt einen Review-Loop und verhindert „stille Lösungen".

2. Review-Loop (nach jedem Lovable-Commit)

git fetch -q origin && git reset -q --hard origin/HEAD
git log --oneline <letzter-SHA>..origin/HEAD
npx eslint src/ --max-warnings=0
npx vitest run

Erst wenn ESLint 0 Fehler und alle Tests grün sind → ABGENOMMEN.

3. Pflicht-Regeln (aus Erfahrung teuer gelernt)

Prettier/ESLint VOR jedem Commit. Jeder Lovable-Prompt endet mit: „Vor dem Commit: npx prettier --write + npx eslint --fix über alle geänderten Dateien. CI muss grün sein." → Spart die wiederkehrenden Formatierungs-Nachzieher.

CI nach JEDEM Commit prüfen, nicht erst wenn rote Runs auflaufen. (Lektion: zwischen CI #75 und #88 waren ~13 rote Runs unbemerkt.)

Migrationen immer als Vorab-SQL-Skizze im Prompt mitgeben — nicht Lovable raten lassen. Reduziert Schema-Fehler erheblich.

Massen-SQL in Batches (max. ~2000–2500 Zeilen pro Datei), sonst bricht der Supabase-Editor mit Connection-Fehler ab. Bei Fehler einfach nochmal „Run".

CI-Jobs: check (tsc+eslint+vitest) muss grün sein. db-integration ist gelegentlich flaky („role_assignments insert failed: upstream") — das ist ein Timing-Problem des lokalen Supabase-Stacks, kein Code-Bug.

4. Stammdaten-Referenz (COCO Produktion)

Organisation

IDorganization_id77838674-26c1-40dd-9b74-eb1041e79b95

Standorte (locations)

Namelocation_idSpicery44a99e7e-93be-44b1-89ab-38e364a02ddcYUM14c2d773-6c5f-4a24-ba00-1c726f277091TSB7918a4cd-0388-49b3-abfb-8105b8f17815

Rollen

admin > manager > staff (Hierarchie) + payroll (Seitenrolle, nur Lesezugriff auf Zeitübersicht/Perioden/Buchhaltung, kein Schreibrecht).

Abrechnungsperioden

Immer 26. eines Monats bis einschließlich 25. des Folgemonats. Label = Monat des End-Datums. Beispiel: „Juni 2026" = 26.05.–25.06.2026.

Skills (skills-Tabelle, je Kategorie)

NameKategorieFarbeVSkitchen#bae6fdPASSkitchen#fecdd3SPÜLENkitchen#d1fae5COkitchen#fed7aaSERVICEservice#dbeafeBARservice#ede9fe19 Uhrservice#99f6e4GLgl#ffe4e6Hausmeisterother#e7e5e4

5. Alt-System → COCO Mappings (für Daten-Migrationen)

Quell-Repos (Lovable/GitHub, frasum)

COCO (Ziel): blank-slate-react

tagesabrechnung (Kasse/Zeit-Quelle)

bunker-shift-flow (Dienstplan-UI-Vorlage: RosterGrid, Paint-Tool)

thaitime-12f46b18 (Dienstplan-Daten + Display-Vorlage)

thaitime → COCO Standort-Mapping

thaitime branchCOCO locationspicery 83f56090…Spiceryyum f1229497…YUMTSB 2b00f500…TSB

thaitime → COCO Skill-Mapping (Dienstplan)

thaitimeCOCOVorspeiseVSpassPASSspülenSPÜLENKochen 1, Kochen 2COService 1–4SERVICEBarBAR19 Uhr19 UhrGLGLHausmeisterHausmeister

Mitarbeiter-Mapping

Über das Nickname in Klammern im thaitime-Vornamen, z.B. „Adisorn (SORN)" → COCO display_name „SORN". Sonderfall: „Sumitr (PAE)" → SUMITR. „Lasse" existiert nicht in COCO (ignoriert).

6. Aktueller Modul-Status (14.06.2026)

ModulStatusB3 Kasse + B4 Trinkgeld + B5 Tresor✅B6 Zeitübersicht (Wochenplan/Zusammenfassung/Buchhaltung/Perioden)✅B7 Perioden (26.–25.) + Import Jan–Sep 2026✅B8 Lohnbüro-Rolle (payroll)✅D1 Dienstplan-Datenmodell + Grid✅D2a–e Dienstplan editierbar, Realtime, Service-Symbole, Cross-Booking✅Dienstplan-Migration (4498 Schichten aus thaitime)✅D3 Öffentliches Display (Token-URL, Auto-Refresh, Rotation, Legende)⏳ offenBrutto/Netto (Lohnberechnung, SFN, Steuerklassen)⏳ offenProvision (wochenbasiert)⏳ offen