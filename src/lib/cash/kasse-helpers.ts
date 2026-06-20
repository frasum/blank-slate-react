import { fmtCents, parseEuroToCents as parseEuroToCentsBase } from "@/lib/format";

export function parseEuroToCents(value: string): number | null {
  return parseEuroToCentsBase(value, { emptyAs: 0, allowNegative: true });
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function fmtSignedCents(c: number): string {
  const sign = c > 0 ? "+" : c < 0 ? "−" : "";
  return `${sign}${fmtCents(Math.abs(c))} €`;
}

export function focusNextInput(current: HTMLInputElement) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input:not([disabled]):not([type="hidden"])'),
  ).filter((el) => el.offsetParent !== null);
  const idx = inputs.indexOf(current);
  if (idx >= 0 && idx < inputs.length - 1) {
    const next = inputs[idx + 1];
    next.focus();
    next.select();
  }
}
