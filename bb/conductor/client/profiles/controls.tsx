import type { ReactNode } from "react";
import type { ProfileChoice } from "conductor/podium/profiles-view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Notice } from "../ui/notice";
import { STATUS_TEXT } from "../ui/status";

/** One notice: a success or warning icon, text, and optional action or dismiss. */
export function StatusNotice({
  tone,
  children,
  action,
  onDismiss,
}: {
  tone: "success" | "warning";
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: (this: void) => void;
}) {
  const warning = tone === "warning";
  return (
    <Notice warning={warning}>
      <div className="flex items-start gap-2">
        <Icon
          name={warning ? "AlertTriangle" : "CircleCheck"}
          fallback="Info"
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0",
            STATUS_TEXT[warning ? "statusWarning" : "statusSuccess"],
          )}
        />
        <div className="min-w-0 flex-1 space-y-2 text-foreground">
          <div>{children}</div>
          {action}
        </div>
        {onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dismiss notice"
            className="-m-1 size-6"
            onClick={onDismiss}
          >
            <Icon name="X" fallback="CircleX" aria-hidden />
          </Button>
        )}
      </div>
    </Notice>
  );
}

/** An inline error line, announced when it appears. */
export function ErrorText({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

/** What a field shows under its control. */
export interface FieldNotes {
  helper?: string | undefined;
  error?: string | undefined;
}

/** The attributes that tie a field's control to its label, helper and error. */
export function fieldIds(id: string, { helper, error }: FieldNotes) {
  const described = [helper && `${id}-helper`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described || undefined,
  } as const;
}

/** One labeled editor field with its helper line and, when present, error. */
export function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  /** The control's id; the label points at it. */
  id: string;
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {helper && (
        <p id={`${id}-helper`} className="text-[11px] text-muted-foreground">
          {helper}
        </p>
      )}
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </div>
  );
}

/**
 * A catalog-driven select. The trigger shows the chosen label, or the raw
 * stored id when the catalog does not offer it; each option shows its quieter
 * detail, such as "default" or "elevated".
 */
export function ProfilePicker({
  id,
  notes = {},
  options,
  value,
  onSelect,
}: {
  id: string;
  notes?: FieldNotes;
  options: readonly ProfileChoice[];
  /** The selected value, or "" when nothing is chosen. */
  value: string;
  onSelect(this: void, value: string): void;
}) {
  const chosen = options.find((option) => option.value === value);
  return (
    <Select value={value} onValueChange={onSelect}>
      <SelectTrigger
        {...fieldIds(id, notes)}
        className={cn(notes.error && "border-destructive")}
      >
        <SelectValue placeholder="Not set">
          {value ? (chosen?.label ?? value) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            textValue={option.label}
          >
            {option.label}
            {option.detail && (
              <span className="ml-2 text-xs text-muted-foreground">
                {option.detail}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A toggle chip: pressed fills with the foreground color. */
export function ToggleChip({
  label,
  pressed,
  onToggle,
  ...data
}: {
  label: string;
  pressed: boolean;
  onToggle(this: void): void;
} & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        pressed
          ? "border-foreground bg-foreground font-semibold text-background"
          : "border-border text-foreground hover:bg-state-hover",
      )}
      {...data}
    >
      {label}
    </button>
  );
}

/**
 * A segmented control. Pressing the active segment clears the choice, which
 * the size control uses to unset it.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; accessibleLabel: string }[];
  value: string;
  onChange(this: void, value: T | ""): void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex min-w-60 gap-0.5 rounded-md bg-muted p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.accessibleLabel}
            data-profile-size={option.value}
            onClick={() => onChange(active ? "" : option.value)}
            className={cn(
              "h-8 flex-1 rounded px-3 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
