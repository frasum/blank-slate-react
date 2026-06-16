// Einheitliches Tab-Styling für Top-/Sub-Navigation und Button-Tabs.
// Aktiv: gefülltes Pill mit Primary-Rand. Inaktiv: gedimmt mit Hover.
import * as React from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

export const tabBase =
  "-mb-px inline-flex items-center border-b-2 border-transparent px-3 pb-2 pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

export const tabActive = "border-primary bg-primary/5 text-foreground font-semibold rounded-t-md";

export function tabClass(active: boolean, extra?: string) {
  return [tabBase, active ? tabActive : "", extra ?? ""].filter(Boolean).join(" ");
}

type NavTabProps = LinkProps & {
  children: React.ReactNode;
  className?: string;
};

export function NavTab({ children, className, ...linkProps }: NavTabProps) {
  return (
    <Link
      {...(linkProps as LinkProps)}
      className={[tabBase, className ?? ""].filter(Boolean).join(" ")}
      activeProps={{ className: tabActive }}
    >
      {children}
    </Link>
  );
}

type TabButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
};

export function TabButton({ active, className, children, ...rest }: TabButtonProps) {
  return (
    <button role="tab" aria-selected={active} className={tabClass(active, className)} {...rest}>
      {children}
    </button>
  );
}
