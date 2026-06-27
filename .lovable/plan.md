## Lohnabrechnungen (payslips) — Plan

### 1. Migration (RLS-Korrektur)
Neue Supabase-Migration: die vier vorhandenen `payslips_*`-Policies auf `storage.objects` droppen und neu anlegen.
- `payslips_select_own_or_admin` (SELECT): Staff liest eigene (`org/staff/...`), Admin liest alle der eigenen Org.
- `payslips_insert_admin`, `payslips_update_admin`, `payslips_delete_admin`: nur `ra.role = 'admin'` der Org (Manager-Zweig fällt weg).
- Pfad-Konvention `{organization_id}/{staff_id}/<name>` bleibt; SQL exakt wie im Prompt.

### 2. Reines Modul + Test
- `src/lib/payslips/payslip-path.ts`:
  - `payslipFolder(org, staff)` → `${org}/${staff}`.
  - `sanitizePayslipFileName(name)`: erlaubt `[A-Za-z0-9._ -]`, lehnt `/`, `\`, `..`, leer, mit `.` beginnend ab → `string | null`.
  - `isPayslipPathAllowed({ path, organizationId, staffId, role })`: eigene immer, Admin org-weit, sonst false.
- `src/lib/payslips/payslip-path.test.ts` mit den im Prompt genannten Fällen, abschließendem Newline.

### 3. Server-Functions
`src/lib/payslips/payslips.functions.ts` analog `cash.functions.ts`:
- `loadAdminCaller(context.supabase, context.userId, minRole)` zur Gate-Prüfung.
- `supabaseAdmin` per `await import("@/integrations/supabase/client.server")` innerhalb des Handlers.
- Funktionen:
  1. `listMyPayslips` (GET, `staff`): list folder, `.emptyFolderPlaceholder` filtern, Rückgabe `{ name, path, createdAt, sizeBytes }[]`.
  2. `getPayslipSignedUrl` (POST, `staff`, `{ path }`): `isPayslipPathAllowed` prüfen, sonst `ForbiddenError`; `createSignedUrl(path, 60)`.
  3. `listStaffPayslips` (GET, `admin`, `{ staffId }`): wie 1 für fremden Folder.
  4. `uploadPayslip` (POST, `admin`, `{ staffId, fileName, contentBase64 }`): Sanitize, `Uint8Array.from(atob(...), c => c.charCodeAt(0))`, Upload mit `contentType: "application/pdf"`, `upsert: true`.
  5. `deletePayslip` (POST, `admin`, `{ path }`): `path.startsWith(org + "/")` prüfen, `remove([path])`.

### 4. Staff-Portal-Route
`src/routes/_authenticated/lohn.tsx`:
- `createFileRoute`, Title „Lohnabrechnungen".
- `mx-auto max-w-xl space-y-6 px-4 py-8` (PortalShell vorhanden).
- `useQuery(["payslips","mine"], listMyPayslips)`.
- Liste mit Dateiname + Datum, „Öffnen" → `getPayslipSignedUrl` → `window.open(url, "_blank")`.
- Leerzustand-Text, Header-Link „Zur Stempeluhr".

### 5. Portal-Nav-Erweiterung
`src/lib/nav/portal-nav.ts`: neues Item `{ to: "/lohn", label: "Lohn", icon: FileText }` (lucide) für staff/manager/admin direkt nach „Abrechnung".

### 6. Admin-Karte
`src/routes/_authenticated/admin/staff.$staffId.tsx`: Karte „Lohnabrechnungen" nur wenn `identity.role === "admin"`:
- `useQuery(["payslips","staff",staffId], …)`, „Öffnen" + „Löschen" (mit `confirm`).
- Upload via `<input type="file" accept="application/pdf">`, `FileReader.readAsDataURL`, base64 = `result.split(",")[1]`, danach Liste invalidieren, Toast.

### 7. Abschluss
`prettier --write` auf alle neuen/geänderten Dateien (3.7.3); `tsc`, `eslint`, `vitest` müssen grün bleiben.

### Reihenfolge der Tool-Calls
1. `supabase--migration` für RLS (wartet auf Approval, Types werden regeneriert).
2. Danach Code: payslip-path + Test, payslips.functions.ts, /lohn-Route, portal-nav, staff-Detail-Karte.
3. Prettier-Lauf.
