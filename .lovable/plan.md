## Ziel
Das hochgeladene COCO-Logo als zentrales Markenbild ersetzen:
1. Loginscreen (`/auth`)
2. Header eingeloggter Bereich (überall wo `<BrandLockup size="sm" />` und `size="lg"` verwendet wird)
3. Favicon
4. OG/Twitter-Image
5. Dark-Mode-Variante für 1 + 2

## Umsetzung

### 1. Assets erzeugen & hochladen
- **Light-Variante (Original, dunkelblau auf hell):**
  `lovable-assets create --file /mnt/user-uploads/Bildschirmfoto_2026-06-16_um_11.45.58.png --filename coco-logo-light.png > src/assets/coco-logo-light.png.asset.json`
- **Dark-Variante (per `imagegen--edit_image`):** Strichführung weiß/hell auf transparent, gleiche Proportionen → `src/assets/coco-logo-dark.png.asset.json`.
- **Favicon (quadratisch, Infinity-Mark ohne Tagline, transparent, 512×512):** per `imagegen--edit_image` → `src/assets/coco-favicon.png.asset.json`. Eine Variante reicht (transparent funktioniert in beiden Tab-Modi).
- **OG-Image (1200×630, Logo zentriert, heller Markenhintergrund):** per `imagegen--edit_image` → `src/assets/coco-og.png.asset.json`. Statisch, Crawler rendern keinen Dark-Mode.

### 2. `BrandLockup` umbauen (`src/components/brand-lockup.tsx`)
Statt Text-Wortmarke wird in beiden Größen das hochgeladene Logo gerendert (enthält Wortmarke + Tagline bereits). Beide Varianten parallel mit Tailwind-Dark-Klassen:
```tsx
<img src={logoLight.url} alt="COCO – Central Operations Cockpit"
     className={cn("h-auto block dark:hidden", sizeClass)} />
<img src={logoDark.url}  alt="COCO – Central Operations Cockpit"
     className={cn("h-auto hidden dark:block", sizeClass)} />
```
- `size="sm"` → `max-w-[140px]` (Admin-Header, Tagline im verkleinerten Logo gut lesbar; falls zu fein, fällt der Header-Text auf `sr-only`-Alt zurück — wird beim ersten Build visuell verifiziert).
- `size="lg"` → `max-w-xs mx-auto` (Auth/Hub).
- Komponentensignatur bleibt unverändert → alle Call-Sites (`__root.tsx`, `_authenticated/index.tsx`, `auth.tsx`, etc.) brauchen keine Änderung.

### 3. Favicon (`src/routes/__root.tsx`)
- Vorhandene Favicon-`links` ersetzen durch:
  - `{ rel: "icon", type: "image/png", href: cocoFavicon.url }`
  - `{ rel: "apple-touch-icon", href: cocoFavicon.url }`

### 4. OG/Twitter-Image (`src/routes/__root.tsx`)
Im `head().meta`-Array setzen:
- `{ property: "og:image", content: cocoOg.url }`
- `{ name: "twitter:image", content: cocoOg.url }`
- `{ name: "twitter:card", content: "summary_large_image" }`

### 5. Verifikation
Preview-Screenshot auf `/auth` (light + dark) und auf einer Admin-Route, um zu prüfen dass das `sm`-Logo im Header sauber sitzt und nicht zu groß wird.

## Hinweise
- Crawler-Cache: Link-Vorschauen aktualisieren erst nach Re-Scrape.
- Separates Dark-Favicon nicht nötig (transparent funktioniert in beiden Tab-Themes).
- `BrandLockup`-Datei behält Namen und API — nur die Implementierung wechselt von Text zu `<img>`.
