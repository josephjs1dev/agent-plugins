import type { ReminderTier } from "essentials/context-reminder/reminder-policy";
import { cn } from "@/lib/utils";

/** A dot in the tier's color: amber to warn, red to ask, green below both. */
export function TierDot({ tier }: { tier: ReminderTier | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tier === "ask" && "bg-destructive",
        tier === "warn" && "bg-amber-500",
        tier === null && "bg-emerald-500",
      )}
    />
  );
}
