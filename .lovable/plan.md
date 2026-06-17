## Ziel
Auf `/admin` ein Bereich „Mitarbeiterportal testen": Link zum Portal + Mitarbeiter-Auswahl. Beim Start einer Impersonation handelt der Admin **serverseitig** als der gewählte Mitarbeiter – alle Abfragen, RLS-Policies und Sichtbarkeiten verhalten sich wie bei diesem Mitarbeiter.

## Wichtige Vorab-Warnung (Ehrlichkeitsregel)
Echtes Impersonate ist invasiv, weil die DB-Identität an `auth.uid()` hängt und sämtliche RLS-Policies darauf aufbauen. Es gibt nur zwei saubere Wege:

1. **Admin-API "sign in as user"** → tauscht die komplette Browser-Session. Admin ist danach ausgeloggt; „Zurück zu Admin" geht nur über erneutes Admin-Login. Einfach im Code, unangenehm im Alltag.
2. **Indirektion in den SECURITY-DEFINER-Helfern** (`current_staff_id`, `current_organization_id`, `current_role`, `has_role`, `is_admin`, `has_min_permission`). Diese prüfen zusätzlich eine Tabelle `admin_impersonations` und lösen die Identität ggf. über die Ziel-`user_id` auf. Alle bestehenden RLS-Policies funktionieren ohne Änderung weiter, weil sie über die Helfer gehen.

**Empfehlung: Weg 2.** Weg 1 wäre für reines Testen nicht brauchbar.

**Risiko Weg 2:** Wer impersoniert, verliert während der Sitzung seine Admin-Rechte (sonst wäre der Test wertlos). Das beendigen-der-Impersonation darf deshalb **nicht** über `is_admin()` gehen, sondern muss direkt auf `auth.uid()` der Original-Session prüfen. Außerdem muss jede Police, die ich nicht über die Helfer geprüft habe, einmal manuell angeschaut werden (Policy-Inventur).

## Migration

```sql
-- nur admins, die gerade NICHT selbst impersoniert werden, dürfen anlegen.
create table public.admin_impersonations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admin_user_id  uuid not null,              -- echte auth.uid() des Admins
  target_staff_id uuid not null references public.staff(id) on delete cascade,
  target_user_id  uuid,                       -- falls verknüpft (für FK in user_links)
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  reason text
);
create unique index on public.admin_impersonations (admin_user_id) where ended_at is null;

grant select on public.admin_impersonations to authenticated;
grant all    on public.admin_impersonations to service_role;
alter table public.admin_impersonations enable row level security;

-- Policy: ein Admin sieht nur seine eigenen Einträge; Insert/Update läuft serverseitig (service role).
create policy "own impersonations readable"
  on public.admin_impersonations for select
  to authenticated using (admin_user_id = auth.uid());
```

Helfer-Funktionen werden um ein gemeinsames Prinzip erweitert:

```sql
create or replace function public._effective_user_id() returns uuid
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(
    (select ul.user_id
       from public.admin_impersonations ai
       join public.user_links ul on ul.staff_id = ai.target_staff_id
                                 and ul.organization_id = ai.organization_id
      where ai.admin_user_id = auth.uid()
        and ai.ended_at is null
      limit 1),
    auth.uid()
  )
$$;
```

`current_role`, `current_staff_id`, `current_organization_id`, `has_role` werden so umgebaut, dass sie `_effective_user_id()` statt `auth.uid()` verwenden (drop-then-create, gleiche Signatur).

`is_admin()` bekommt zwei Modi:
- `is_admin()` (Standard, wird in Policies benutzt) → über `_effective_user_id` → spiegelt die impersonierte Rolle.
- `is_real_admin()` (neu) → direkt über `auth.uid()`, ohne Indirektion. Wird **nur** von der Impersonation-Server-Funktion benutzt.

## Server-Funktionen

Neue Datei `src/lib/admin/impersonation.functions.ts`:

- `listStaffForImpersonation()` – gibt aktive Mitarbeiter mit verknüpftem User zurück; verlangt `is_real_admin`.
- `startImpersonation({ staffId, reason })` – prüft `is_real_admin`, beendet evtl. offene Sitzung des Admins, fügt neuen Eintrag ein, schreibt `audit_log` (`admin.impersonation_started`).
- `stopImpersonation()` – setzt `ended_at = now()` für die offene Sitzung **dieses Admins** (Lookup über `admin_user_id = ?` mit der JWT-`auth.uid()`, nicht über `is_admin`), schreibt Audit-Log.
- `getImpersonationStatus()` – liefert `{ active: boolean, asStaff?: {...}, since?: ts }`.

`getMyIdentity` wird so erweitert, dass es zusätzlich `impersonatedBy?: { adminUserId, since }` mitliefert (für das Banner). Die eigentliche Rolle/staffId stammt automatisch aus den umgebauten Helfern → kein extra Mapping nötig.

## UI

`/admin`: neue Karte „Mitarbeiterportal testen" (nur Rolle `admin`, ausgeblendet wenn der aktuelle User real kein Admin ist – also auch ausgeblendet, sobald eine Impersonation läuft).

Neue Route `src/routes/_authenticated/admin/impersonate.tsx`:
- Liste der Mitarbeiter (Suche), Pflicht-Feld „Grund".
- Button „Als … testen" → ruft `startImpersonation`, dann `navigate({ to: "/" })` und Query-Cache leeren.

Globales Impersonation-Banner in `src/routes/_authenticated/route.tsx`:
- Wenn `identity.impersonatedBy` gesetzt: rote Leiste oben „Vorschau als {Name} – [Beenden]".
- Button „Beenden" ruft `stopImpersonation`, leert Query-Cache, `navigate({ to: "/admin" })`.

## Datenfluss/Cache

Nach `start`/`stop` immer: `queryClient.clear()` + `router.invalidate()`, damit alle Loader mit der neuen effektiven Identität neu laden.

## Audit & Sicherheit

- Jede Start/Stop-Aktion → `audit_log` mit `admin_user_id`, `target_staff_id`, `reason`.
- Impersonate-API nutzt `is_real_admin()` als Gate – nie `is_admin()`, sonst könnte ein impersonierter Admin verschachteln/festhängen.
- Auto-Stop nach z.B. 60 min: noch nicht jetzt; Hinweis im Banner („läuft seit …"), Beenden manuell.

## Schritte
1. Migration: Tabelle + Grants + RLS + Policy + neue/umgebaute Helfer (`drop` vor `create`).
2. Server-Funktionen + `getMyIdentity`-Erweiterung.
3. UI: Karte auf `/admin`, neue Route, Banner im `_authenticated`-Layout.
4. Manuelle Policy-Inventur: alle Policies durchgehen, die direkt `auth.uid()` (statt der Helfer) verwenden, und entscheiden, ob sie auf die Helfer umgestellt werden müssen.
5. Smoke-Test: Admin → Impersonate staff → `/zeit`, `/admin` (sollte verschwinden), Beenden → wieder Admin.

## Offene Fragen / Annahmen
- Annahme: Mitarbeiter ohne verknüpften `auth.users`-Eintrag (Pseudo-Mail noch nicht eingeladen) können **nicht** impersoniert werden – sie tauchen mit „kein Account" im Picker auf und sind disabled. Bestätigen?
- Annahme: Während einer aktiven Impersonation darf der Admin keine neue Impersonation starten (muss erst beenden). Bestätigen?
- Soll `audit_log` zusätzlich jede Schreibaktion markieren, die WÄHREND einer Impersonation passiert (z.B. neues Feld `via_impersonation_id`)? Empfehlung: ja, aber als eigener kleiner Folge-Schritt nach dem Grundgerüst.