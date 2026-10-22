import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * A bordered 28px thread-header control: a glyph and label, or the glyph only
 * on compact viewports. `label` is also the accessible name.
 */
export const HeaderTrigger = forwardRef<
  HTMLButtonElement,
  Omit<ComponentPropsWithoutRef<"button">, "children"> & {
    icon: ReactNode;
    label: string;
    compact: boolean;
  }
>(({ icon, label, compact, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={label}
    className={cn(
      "inline-flex h-7 max-w-64 items-center gap-1.5 self-center rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground",
      compact && "w-7 justify-center px-0",
      className,
    )}
    {...props}
  >
    {icon}
    {!compact && <span className="truncate">{label}</span>}
  </button>
));
HeaderTrigger.displayName = "HeaderTrigger";
