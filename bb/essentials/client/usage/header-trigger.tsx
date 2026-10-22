import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * A 28px thread-header control: icon and label, or icon only on compact
 * viewports. `label` is also the accessible name.
 */
export const HeaderTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    icon: string;
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
      "inline-flex h-7 max-w-64 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground",
      compact && "w-7 justify-center px-0",
      className,
    )}
    {...props}
  >
    <Icon
      name={icon}
      fallback="Gauge"
      aria-hidden
      className="size-4 shrink-0"
    />
    {!compact && <span className="truncate">{label}</span>}
  </button>
));
HeaderTrigger.displayName = "HeaderTrigger";
