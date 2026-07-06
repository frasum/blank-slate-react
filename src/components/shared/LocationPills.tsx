// Wiederverwendbarer Standort-Pillenwähler. Generisch über PillSelect.
// `includeAll` rendert zusätzlich eine "Alle"-Pille; deren Wert ist per
// `allValue` konfigurierbar (Default "__all__"), damit bestehende Sentinels
// (z. B. "all" in zeit-uebersicht) ohne Umbau weiterlaufen.
import { PillSelect, type PillSelectOption } from "@/components/ui/pill-select";
import { useLocationThemeSync } from "@/lib/location-theme/theme-utils";

type Props = {
  locations: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  allValue?: string;
  allLabel?: string;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
};

export function LocationPills({
  locations,
  value,
  onChange,
  includeAll = false,
  allValue = "__all__",
  allLabel = "Alle",
  size,
  className,
  ariaLabel = "Standort",
}: Props) {
  // TH1 — meldet die aktuelle Standort-Auswahl an den Theme-Kontext.
  // „Alle"/leer → neutral (kein Match in der Locations-Liste).
  useLocationThemeSync(locations, value);
  const options: PillSelectOption<string>[] = locations.map((l) => ({
    value: l.id,
    label: l.name,
  }));
  if (includeAll) options.push({ value: allValue, label: allLabel });
  if (options.length === 0) return null;
  return (
    <PillSelect
      options={options}
      value={value === "" ? null : value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      size={size}
      className={className}
      themed
    />
  );
}
