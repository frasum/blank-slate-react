// COCO Brand-Lockup. Bildmarke (Wortmarke + Tagline) als CDN-Asset.
// Zwei Größen: "lg" für Hub/Auth, "sm" für Admin-Header.
// Light- und Dark-Variante via Tailwind dark:-Klassen.

import logoLight from "@/assets/coco-logo-light.png.asset.json";
import logoDark from "@/assets/coco-logo-dark.png.asset.json";

type Size = "lg" | "sm";

const ALT = "COCO – Central Operations Cockpit";

export function BrandLockup({ size = "lg" }: { size?: Size }) {
  const sizeClass =
    size === "sm"
      ? "h-8 w-auto md:h-9"
      : "mx-auto w-full max-w-xs h-auto md:max-w-sm";
  return (
    <div className={size === "lg" ? "text-center" : "flex items-center"}>
      <img
        src={logoLight.url}
        alt={ALT}
        className={`${sizeClass} block dark:hidden`}
      />
      <img
        src={logoDark.url}
        alt={ALT}
        className={`${sizeClass} hidden dark:block`}
      />
    </div>
  );
}