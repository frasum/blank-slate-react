## Ursache

Auf Datenseite sind alle drei identisch (Rolle `staff`, verknüpfter User, Dateien im richtigen Storage-Pfad, gleiche Org). Der Unterschied liegt im Client-Code `src/routes/_authenticated/lohn.tsx`:

```ts
async function open(entry) {
  const res = await callOpen({ data: { path: entry.path } }); // async
  window.open(res.url, "_blank", "noopener");                 // NACH await
}
```

`window.open` **nach** einem `await` wird von iOS-Browsern (Safari, Chrome iOS) als „nicht aus User-Gesture" gewertet und vom **Popup-Blocker still verworfen** — genau das Symptom „Datei ist sichtbar, aber Klick auf Öffnen tut nichts". Ob es blockiert wird, hängt an der individuellen Safari-Einstellung *Einstellungen → Safari → Popups blockieren* — deshalb ging es bei Jasmin (Popups erlaubt) und bei Andi/Europe (Standard-Einstellung: Popups blockiert) nicht.

## Fix (in Build-Modus umzusetzen)

Nur `src/routes/_authenticated/lohn.tsx` anpassen — keine Server-Fn-, RLS- oder Schema-Änderung nötig.

Beim Klick **sofort synchron** ein neues Tab-Handle öffnen (im User-Gesture), dann die Signed-URL holen und `handle.location.href` setzen. Wenn der Browser trotzdem blockiert (`win === null`), im aktuellen Tab weiterleiten — das umgeht Popup-Blocker vollständig.

```ts
async function open(entry) {
  const win = window.open("about:blank", "_blank", "noopener");
  try {
    const res = await callOpen({ data: { path: entry.path } });
    if (win && !win.closed) win.location.href = res.url;
    else window.location.href = res.url; // Fallback: gleicher Tab
  } catch (e) {
    if (win && !win.closed) win.close();
    alert(e instanceof Error ? e.message : "Öffnen fehlgeschlagen.");
  }
}
```

Zusätzlich kurz prüfen, ob die Admin-Payslip-Öffnen-Stelle in `src/routes/_authenticated/admin/staff.$staffId.tsx` das gleiche Muster hat, und dort spiegeln.

## Verifikation

- Prettier/ESLint/tsc/Vitest-Gate laufen lassen.
- Andi oder Europe die Datei antippen lassen — der Tab öffnet jetzt zuverlässig (bzw. das PDF öffnet notfalls im gleichen Tab, ohne dass es „nichts tut").

Kein Datenkorrektur-Bedarf für Andi/Europe; ausschließlich Frontend-Change.