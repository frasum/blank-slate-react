// Generische Pill-Gruppe für „einzige Pflicht-Auswahl mit wenigen Optionen".
// Aktiv = primary-Vollfläche, inaktiv = neutraler Rahmen mit Hover.
// Tastatur: Pfeiltasten wechseln Auswahl (Radiogroup-Pattern).
import { useCallback, useRef } from "react";

export type PillSelectOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: PillSelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
  /**
   * TH1 — aktiviert das Standort-Farbthema für die aktive Pille (nur
   * LocationPills setzt dies). Ohne die Prop ändert sich das Aussehen
   * aller anderen PillSelect-Verwendungen nicht.
   */
  themed?: boolean;
};

export function PillSelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
  themed = false,
}: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + dir + options.length) % options.length;
      const opt = options[next];
      if (opt) {
        onChange(opt.value);
        refs.current[next]?.focus();
      }
    },
    [options, onChange],
  );

  if (options.length === 0) return null;

  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={["inline-flex flex-wrap items-center gap-2", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        const themedActive = themed && active;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (value === null && idx === 0) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={[
              "rounded-full border font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pad,
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-foreground hover:bg-muted",
            ].join(" ")}
            style={
              themedActive
                ? {
                    background: "var(--loc-accent, var(--primary))",
                    color: "var(--loc-accent-fg, var(--primary-foreground))",
                    borderColor: "var(--loc-accent, var(--primary))",
                  }
                : undefined
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
