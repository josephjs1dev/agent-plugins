import type { History } from "essentials/history";
import { sessionKey } from "essentials/history-display";
import { Button } from "@/components/ui/button";
import { SESSION_PAGE } from "./query";
import { SessionUsage } from "./breakdown";
import { HistorySection } from "./controls";

/** One page of sessions with Previous and Next paging. */
export function HistorySessions({
  sessions,
  sessionCount,
  scopeLabel,
  showDirectory,
  sessionOffset,
  onPageChange,
}: {
  sessions: History["sessions"];
  sessionCount: number;
  scopeLabel: string;
  showDirectory: boolean;
  sessionOffset: number;
  onPageChange(offset: number): void;
}) {
  const start = sessions.length ? sessionOffset + 1 : 0;
  const end = sessions.length ? sessionOffset + sessions.length : 0;
  return (
    <HistorySection
      title="Sessions"
      description={`${start}–${end} of ${sessionCount} · ${scopeLabel}`}
      trailing={<span className="text-xs text-muted-foreground">Tokens</span>}
    >
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions recorded. {scopeLabel}.
        </p>
      ) : (
        <div>
          {sessions.map((session) => (
            <SessionUsage
              key={sessionKey(session)}
              session={session}
              showDirectory={showDirectory}
            />
          ))}
        </div>
      )}
      {sessionCount > SESSION_PAGE && (
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={sessionOffset === 0}
            onClick={() =>
              onPageChange(Math.max(0, sessionOffset - SESSION_PAGE))
            }
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={end >= sessionCount}
            onClick={() => onPageChange(sessionOffset + SESSION_PAGE)}
          >
            Next
          </Button>
        </div>
      )}
    </HistorySection>
  );
}
