import { useCallback, useId, useState, type ReactNode } from "react";
import {
  ASK_PERCENT_OPTIONS,
  NOTIFY_EVERY_OPTIONS,
  SNOOZE_MINUTE_OPTIONS,
  WARN_PERCENT_OPTIONS,
} from "essentials/context-reminder/contracts";
import { formatTokens } from "essentials/context-reminder/gauge";
import type { Character } from "essentials/context-reminder/sprite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { REMINDER_CHANGED } from "../../shared/signals";
import { errorMessage, useCall, useQuery, type Output } from "../data";
import { PixelSprite } from "./pixel-sprite";

type Settings = Output<"context_reminder.settings">;

const SMALL_WINDOW_TOKENS = 258_000;
const CHARACTERS: readonly { value: Character; label: string }[] = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];

/** Settings changes publish `REMINDER_CHANGED` with a null thread. */
function isSettingsChange(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { threadId?: unknown }).threadId === null
  );
}

function percentHint(percent: number): string {
  const large = formatTokens((1_000_000 * percent) / 100);
  const small = formatTokens((SMALL_WINDOW_TOKENS * percent) / 100);
  return `${large} on a 1M window · ${small} on a 258k window`;
}

const percentLabel = (percent: number) => `${percent}%`;
const turnsLabel = (turns: number) =>
  turns === 1 ? "Every turn" : `${turns} turns`;
const minutesLabel = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="divide-y rounded-lg border bg-card">{children}</div>
    </section>
  );
}

/** One settings row: a label and hint, with its control on the right. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children(id: string): ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children(id)}
    </div>
  );
}

function NumberSelect({
  id,
  value,
  options,
  format,
  disabled,
  onChange,
}: {
  id: string;
  value: number;
  options: readonly number[];
  format(this: void, value: number): string;
  disabled: boolean;
  onChange(this: void, value: number): void;
}) {
  return (
    <Select
      value={String(value)}
      disabled={disabled}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger id={id} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {format(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CharacterPicker({
  value,
  disabled,
  onChange,
}: {
  value: Character;
  disabled: boolean;
  onChange(this: void, character: Character): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Assistant"
      className="flex flex-wrap gap-3 px-4 pb-4"
    >
      {CHARACTERS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex w-24 flex-col items-center gap-2 rounded-lg border-2 bg-muted/40 pt-3.5 pb-2.5 text-sm hover:bg-state-hover disabled:opacity-50",
              selected
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            <PixelSprite character={option.value} tier={null} pixelSize={2} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsForm({
  settings,
  saving,
  onSave,
}: {
  settings: Settings;
  saving: boolean;
  onSave(this: void, patch: Partial<Settings>): void;
}) {
  const locked = !settings.enabled || saving;
  return (
    <>
      <Section title="General">
        <Row
          label="Show Context Reminder"
          hint="Shows the context banner above the composer."
        >
          {(id) => (
            <Switch
              id={id}
              checked={settings.enabled}
              disabled={saving}
              onCheckedChange={(enabled) => onSave({ enabled })}
            />
          )}
        </Row>
      </Section>
      <Section title="Thresholds">
        <Row label="Warn at" hint={percentHint(settings.warnPercent)}>
          {(id) => (
            <NumberSelect
              id={id}
              value={settings.warnPercent}
              options={WARN_PERCENT_OPTIONS}
              format={percentLabel}
              disabled={locked}
              onChange={(warnPercent) => onSave({ warnPercent })}
            />
          )}
        </Row>
        <Row
          label="Ask to compact at"
          hint={`${percentHint(settings.askPercent)}. At or below Warn at, every warning asks.`}
        >
          {(id) => (
            <NumberSelect
              id={id}
              value={settings.askPercent}
              options={ASK_PERCENT_OPTIONS}
              format={percentLabel}
              disabled={locked}
              onChange={(askPercent) => onSave({ askPercent })}
            />
          )}
        </Row>
      </Section>
      <Section title="Reminders">
        <Row
          label="Remind every"
          hint="Turns between reminders while above Warn at."
        >
          {(id) => (
            <NumberSelect
              id={id}
              value={settings.notifyEvery}
              options={NOTIFY_EVERY_OPTIONS}
              format={turnsLabel}
              disabled={locked}
              onChange={(notifyEvery) => onSave({ notifyEvery })}
            />
          )}
        </Row>
        <Row
          label="Snooze for"
          hint="How long Snooze pauses a thread's reminders."
        >
          {(id) => (
            <NumberSelect
              id={id}
              value={settings.snoozeMinutes}
              options={SNOOZE_MINUTE_OPTIONS}
              format={minutesLabel}
              disabled={locked}
              onChange={(snoozeMinutes) => onSave({ snoozeMinutes })}
            />
          )}
        </Row>
      </Section>
      <Section title="Look">
        <div>
          <div className="space-y-0.5 px-4 py-3">
            <p className="text-sm font-medium">Assistant</p>
            <p className="text-xs text-muted-foreground">
              Shown in reminders and on this page.
            </p>
          </div>
          <CharacterPicker
            value={settings.character}
            disabled={saving}
            onChange={(character) => onSave({ character })}
          />
        </div>
      </Section>
    </>
  );
}

/**
 * The Context Reminder page in bb's sidebar: the same host-wide settings as
 * the plugin's settings form, with previews. Every change saves at once.
 */
export function ContextReminderPage() {
  const call = useCall();
  const query = useQuery(
    "context_reminder.settings",
    {},
    { signal: REMINDER_CHANGED, accepts: isSettingsChange },
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { set } = query;
  const save = useCallback(
    (patch: Partial<Settings>) => {
      setSaving(true);
      setSaveError(null);
      call("context_reminder.configure", patch)
        .then(set, (cause: unknown) => setSaveError(errorMessage(cause)))
        .finally(() => setSaving(false));
    },
    [call, set],
  );
  const settings = query.data;
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center gap-4">
          <PixelSprite
            character={settings?.character ?? "girl"}
            tier={null}
            pixelSize={4}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-xl font-semibold">Context Reminder</h1>
            <p className="text-sm text-muted-foreground">
              Watches each thread&apos;s context window and reminds you to
              compact before it fills. These settings apply to every thread on
              this bb host.
            </p>
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                Could not save: {saveError}
              </p>
            )}
          </div>
        </header>
        {settings === null && query.error === null && (
          <p className="text-sm text-muted-foreground">
            Loading Context Reminder settings…
          </p>
        )}
        {settings === null && query.error !== null && (
          <p role="alert" className="text-sm text-destructive">
            Could not load the settings: {query.error}
          </p>
        )}
        {settings && (
          <SettingsForm settings={settings} saving={saving} onSave={save} />
        )}
      </div>
    </div>
  );
}
