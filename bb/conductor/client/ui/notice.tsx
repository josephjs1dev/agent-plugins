import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border bg-muted/40 p-3 text-sm",
        warning ? "border-amber-500/60" : "border-border",
      )}
    >
      {children}
    </div>
  );
}

/** A small uppercase section label. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** A quiet disclosure toggle that exposes its expanded state. */
export function Disclosure({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle(this: void): void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold hover:bg-state-hover"
      >
        <span aria-hidden className="text-xs text-muted-foreground">
          {expanded ? "▾" : "▸"}
        </span>
        {label}
      </button>
      {expanded && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}
