Logo bleibt — nur die Ladeperformance wird verbessert. Grund: das Logo auf `/auth` ist ein ~900 KB großes PNG, das aktuell ohne Prioritätshinweis geladen wird und der wahrscheinliche LCP-Kandidat ist.

## Änderungen

1) `src/components/brand-lockup.tsx`
   - Auf beiden `<img>` explizite `width`/`height` setzen (verhindert Layout-Shift, hilft Lighthouse).
   - `fetchPriority="high"`, `decoding="async"` ergänzen.
   - Optionale `size`-Prop-Nutzung bleibt unverändert.

2) `src/routes/auth.tsx` — im `head()`:
   - `<link rel="preload" as="image" href={cocoLogoLight.url} fetchpriority="high" />` (nur Light-Variante; die Dark-Variante ist per `hidden dark:block` initial ohnehin nicht sichtbar).

3) Vorherige Rückmeldung an den SEO-Scanner korrigieren: Finding erneut offen behandeln und nach den Codeänderungen wieder als „fixed" mit passender Begründung markieren.

## Nicht Teil dieses Plans (auf Wunsch später)
- Neuencodierung des Logos als WebP/optimiertes PNG oder Reduktion auf die tatsächliche Anzeigegröße (max ~384 px breit auf `lg`). Das würde die Ladezeit weiter deutlich senken, ändert aber das Asset selbst — dafür bräuchte ich eine Freigabe.
