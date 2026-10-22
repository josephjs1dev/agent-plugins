import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A segmented group of mutually exclusive choices. */
export function ChoiceGroup<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: ReactNode; name?: string }[];
  onChange(value: T): void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted/60 p-0.5"
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <button
            key={String(choice.value)}
            type="button"
            aria-pressed={selected}
            aria-label={choice.name}
            onClick={() => onChange(choice.value)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs",
              "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
              selected
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

/** A titled block of the history view. */
export function HistorySection({
  title,
  description,
  trailing,
  children,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}

/** One label and value line; nested rows are indented and muted. */
export function HistoryValue({
  label,
  value,
  nested = false,
}: {
  label: string;
  value: string;
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 text-xs leading-5",
        nested ? "pl-3 text-muted-foreground" : "text-foreground",
      )}
    >
      <span className="min-w-0">{label}</span>
      <span className="text-right tabular-nums select-text">{value}</span>
    </div>
  );
}
