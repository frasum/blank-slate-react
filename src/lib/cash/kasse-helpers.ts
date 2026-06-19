import { fmtCents } from "@/lib/format";

export function parseEuroToCents(value: string): number | null {
  const t = value.trim().replace(",", ".");
  if (t === "") return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
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