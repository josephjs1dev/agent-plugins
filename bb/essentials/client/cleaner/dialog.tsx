import { useEffect, useState, type ReactNode } from "react";
import {
  CLEANER_DAY_OPTIONS,
  DEFAULT_CLEANER_DAYS,
  type CleanerCandidate,
  type CleanerStatus,
} from "essentials/cleaner/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLEANER_CHANGED } from "../../shared/signals";
import { errorMessage, useCall, useQuery, type Output } from "../data";
import {
  closeCleaner,
  dependents,
  plural,
  setCleanerSnapshot,
  threadCount,
  useCleanerDialogOpen,
} from "./state";

const STATUS_POLL_MS = 60_000;

type CleanResult = Output<"cleaner.clean">;

/**
 * An invisible app overlay. It keeps the footer icon's snapshot current and
 * renders the Cleaner dialog while it is open. Only this overlay uses plugin
 * hooks, because bb supplies the plugin runtime here.
 */
export function CleanerSync() {
  const status = useQuery(
    "cleaner.status",
    {},
    { pollMs: STATUS_POLL_MS, signal: CLEANER_CHANGED },
  );
  const open = useCleanerDialogOpen();
  useEffect(() => {
    setCleanerSnapshot({ status: status.data, error: status.error });
  }, [status.data, status.error]);
  return open ? <CleanerDialog /> : null;
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

function UpdatedAt({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp);
  return (
    <time dateTime={date.toISOString()}>
      Updated{" "}
      {date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}
    </time>
  );
}

/** The update date and, for a tree, how many threads below it are included. */
function CandidateMeta({ entry }: { entry: CleanerCandidate }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <UpdatedAt timestamp={entry.updatedAt} />
      {entry.members.length > 1 ? (
        <span>{entry.members.length - 1} included</span>
      ) : null}
    </span>
  );
}

function SessionCleanupDetails({ status }: { status: CleanerStatus }) {
  if (!status.scanError && !status.pending) {
    return null;
  }
  return (
    <details className="max-h-20 overflow-y-auto text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Session cleanup
        {status.pending ? ` · ${status.pending} pending` : " needs attention"}
      </summary>
      <div className="mt-2 space-y-1 [overflow-wrap:anywhere]">
        {status.scanError ? <ErrorNote>{status.scanError}</ErrorNote> : null}
        {status.problems.map((entry) => (
          <ErrorNote key={entry.threadId}>{entry.message}</ErrorNote>
        ))}
      </div>
    </details>
  );
}

interface RowProps {
  entry: CleanerCandidate;
  checked: boolean;
  disabled: boolean;
  onToggle(checked: boolean): void;
}

function CandidateRow({ entry, checked, disabled, onToggle }: RowProps) {
  return (
    <li className={checked ? "bg-state-active" : "hover:bg-state-hover"}>
      <label className="flex cursor-pointer items-start gap-3 px-5 py-3">
        <input
          type="checkbox"
          aria-label={`Select ${entry.title}`}
          className="mt-0.5 shrink-0 accent-primary"
          disabled={disabled}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="min-w-0 flex-1 space-y-1">
          <span
            className="line-clamp-2 break-words text-sm font-medium leading-5"
            title={entry.title}
          >
            {entry.title}
          </span>
          <CandidateMeta entry={entry} />
        </span>
      </label>
      {entry.members.length > 1 ? (
        <details className="pb-3 pl-12 pr-5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Included threads</summary>
          <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
            {dependents(entry).map((member) => (
              <li
                key={member.id}
                className="line-clamp-2 break-words"
                title={member.title}
              >
                {member.title}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/** The confirmation step: each selected thread, with the threads below it. */
function ConfirmationList({ entries }: { entries: CleanerCandidate[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-5 py-3">
      <ul aria-label="Threads to delete" className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="overflow-hidden rounded-lg border border-border"
          >
            <div className="space-y-1 px-3 py-2.5">
              <div
                className="line-clamp-2 break-words text-sm font-medium leading-5"
                title={entry.title}
              >
                {entry.title}
              </div>
              <CandidateMeta entry={entry} />
            </div>
            {entry.members.length > 1 ? (
              <ul
                aria-label={`Included threads for ${entry.title}`}
                className="space-y-2 border-t border-border bg-muted/20 px-3 py-2.5"
              >
                {dependents(entry).map((member) => (
                  <li
                    key={member.id}
                    className="ml-1 space-y-0.5 border-l-2 border-border pl-3"
                  >
                    <div
                      className="line-clamp-2 break-words text-xs leading-4"
                      title={member.title}
                    >
                      {member.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      <UpdatedAt timestamp={member.updatedAt} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultNote({ result }: { result: CleanResult }) {
  return (
    <>
      <p role="status" className="text-xs">
        Deleted {plural(result.deleted.length, "thread")}.
        {result.skipped.length
          ? ` Skipped ${plural(result.skipped.length, "selection")} that changed or is unavailable.`
          : ""}
      </p>
      {result.skipped.map((entry) => (
        <ErrorNote key={entry.id}>{entry.reason}</ErrorNote>
      ))}
    </>
  );
}

/** Selects old threads, then confirms their permanent deletion in the same dialog. */
export function CleanerDialog() {
  const call = useCall();
  const preview = useQuery("cleaner.preview", {});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingDays, setSavingDays] = useState(false);
  const [days, setDays] = useState(DEFAULT_CLEANER_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CleanResult | null>(null);
  const data = preview.data;
  // A new review token invalidates the old selection.
  useEffect(() => {
    setSelected(new Set());
    setConfirming(false);
  }, [data?.token]);
  useEffect(() => {
    if (data) {
      setDays(data.status.days);
    }
  }, [data?.status.days]);
  const selectedEntries =
    data?.candidates.filter((entry) => selected.has(entry.id)) ?? [];
  const selectedThreads = threadCount(selectedEntries);
  const scanning = preview.loading || savingDays;
  const inputsDisabled = deleting || scanning;

  function toggle(id: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function changeDays(next: number) {
    setDays(next);
    setSavingDays(true);
    setError(null);
    setSelected(new Set());
    setConfirming(false);
    try {
      await call("cleaner.set_days", { days: next });
      preview.refetch();
    } catch (cause) {
      setError(errorMessage(cause));
      setDays(data?.status.days ?? DEFAULT_CLEANER_DAYS);
    } finally {
      setSavingDays(false);
    }
  }

  async function deleteSelected() {
    if (!data || !selectedThreads || deleting || savingDays) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      setResult(
        await call("cleaner.clean", {
          token: data.token,
          threadIds: [...selected],
        }),
      );
      setSelected(new Set());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setConfirming(false);
      setDeleting(false);
      preview.refetch();
    }
  }

  const selection = (
    <>
      <div className="shrink-0 space-y-3 border-t border-border px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-0 items-center gap-3 text-xs">
            <span className="text-muted-foreground">Older than</span>
            <select
              aria-label="Thread age"
              className="min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={days}
              disabled={inputsDisabled}
              onChange={(event) => {
                changeDays(Number(event.target.value)).catch(() => undefined);
              }}
            >
              {CLEANER_DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {plural(day, "day")}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={inputsDisabled}
            onClick={() => preview.refetch()}
          >
            Scan
          </Button>
        </div>
        {data && !data.status.enabled ? (
          <Muted>Turn on Cleaner in the Essentials settings.</Muted>
        ) : null}
        {scanning ? <Muted>Scanning…</Muted> : null}
        {preview.error || error ? (
          <ErrorNote>{error ?? preview.error}</ErrorNote>
        ) : null}
        {result ? <ResultNote result={result} /> : null}
        {data ? <SessionCleanupDetails status={data.status} /> : null}
      </div>
      {data?.candidates.length ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-y border-border bg-muted/20 px-5 py-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary"
                disabled={inputsDisabled}
                checked={selected.size === data.candidates.length}
                onChange={(event) =>
                  setSelected(
                    new Set(
                      event.target.checked
                        ? data.candidates.map((entry) => entry.id)
                        : [],
                    ),
                  )
                }
              />
              Select all
            </label>
            <span
              aria-live="polite"
              className="tabular-nums text-muted-foreground"
            >
              {selectedThreads} selected
            </span>
          </div>
          <ul
            className="min-h-0 min-w-0 flex-1 divide-y divide-border overflow-y-auto"
            aria-label="Old thread candidates"
          >
            {data.candidates.map((entry) => (
              <CandidateRow
                key={entry.id}
                entry={entry}
                checked={selected.has(entry.id)}
                disabled={inputsDisabled}
                onToggle={(checked) => toggle(entry.id, checked)}
              />
            ))}
          </ul>
          {data.more ? (
            <p className="shrink-0 px-5 py-2 text-xs text-muted-foreground">
              First 100 groups shown.
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-8 text-center">
          <Muted>
            {scanning ? "Finding old threads…" : "No old threads to review."}
          </Muted>
        </div>
      )}
    </>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) {
          closeCleaner();
        }
      }}
    >
      <DialogContent
        className="flex h-[min(42rem,85dvh)] max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        hideCloseButton={deleting}
      >
        <DialogHeader className="shrink-0 px-5 pb-4 pr-12 pt-5">
          <DialogTitle>
            {confirming
              ? `Delete ${plural(selectedThreads, "thread")} permanently?`
              : "Cleaner"}
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs">
            {confirming
              ? "Review the selected threads and the threads included below them. bb also runs its normal workspace cleanup."
              : "Select old threads to delete. Pinned threads, the threads below them, and active threads stay."}
          </DialogDescription>
        </DialogHeader>
        {confirming ? (
          <ConfirmationList entries={selectedEntries} />
        ) : (
          selection
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-xs">
          <span className="text-muted-foreground">Provider sessions</span>
          <span>
            {data?.status.deleteSessions
              ? "Also delete Claude Code and Codex sessions"
              : "Kept"}
          </span>
        </div>
        <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-5 py-4">
          {confirming ? (
            <>
              <Button
                variant="outline"
                disabled={deleting}
                onClick={() => setConfirming(false)}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={() => {
                  deleteSelected().catch(() => undefined);
                }}
              >
                {deleting
                  ? "Cleaning…"
                  : `Delete ${plural(selectedThreads, "thread")}`}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={deleting}
                onClick={closeCleaner}
              >
                Cancel
              </Button>
              <Button
                disabled={inputsDisabled || selectedThreads === 0}
                onClick={() => setConfirming(true)}
              >
                Review deletion of {plural(selectedThreads, "thread")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
