import type { CSSProperties } from "react";
import { ROLE_CHIP_COLORS, roleLabel } from "conductor/podium/roles";
import { cn } from "@/lib/utils";

/**
 * A role chip tints with the role's pair for the current appearance; a role
 * without a pair keeps the neutral surface.
 */
export function RoleChip({
  role,
  label,
  className,
}: {
  role: string;
  /** Defaults to the role's display label, falling back to the raw id. */
  label?: string;
  className?: string;
}) {
  const tint = ROLE_CHIP_COLORS[role];
  // Custom properties carry the core's per-appearance pair into the classes.
  const style = tint
    ? ({
        "--chip-bg": tint.light.background,
        "--chip-fg": tint.light.foreground,
        "--chip-bg-dark": tint.dark.background,
        "--chip-fg-dark": tint.dark.foreground,
      } as CSSProperties)
    : undefined;
  return (
    <span
      style={style}
      className={cn(
        "inline-flex min-h-[22px] items-center rounded-full border px-2 py-0.5 text-[11px] leading-[15px] whitespace-nowrap",
        tint
          ? "border-transparent bg-[var(--chip-bg)] text-[var(--chip-fg)] dark:bg-[var(--chip-bg-dark)] dark:text-[var(--chip-fg-dark)]"
          : "border-border bg-muted text-foreground",
        className,
      )}
    >
      {label ?? roleLabel(role)}
    </span>
  );
}
