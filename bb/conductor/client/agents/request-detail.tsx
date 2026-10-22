import { useState } from "react";
import type { AgentItem, Decision } from "conductor/agents/models";
import { ageLabel } from "conductor/agents/attention";
import { agentWorker, DELIVERY_MESSAGES } from "conductor/podium/agents";
import {
  AGENTS_COPY,
  detailMetaLabel,
  itemDelivery,
  itemTitle,
  parentTitle,
  responseLocked,
  responseSubmission,
  snoozeAction,
  snoozeNote,
  turnOutcome,
  type DeliveryNotice,
} from "conductor/podium/agents-view";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Disclosure, Notice, SectionLabel } from "../ui/notice";
import type { DetailActions } from "./actions";
import { ArchiveAction } from "./archive-action";
import { QuestionForm } from "./question-form";

interface Props {
  item: AgentItem;
  now: number;
  stale: boolean;
  directoryIncomplete: boolean;
  catalog: ProviderCatalog | undefined;
  draft: Decision | undefined;
  notice: DeliveryNotice | undefined;
  onDraft(this: void, value: Decision): void;
  actions: DetailActions;
}

/**
 * One queue item: a pending request's response form, or an agent's
 * activity and turn outcome, with navigation, snooze, reminder and archive.
 */
export function RequestDetail({
  item,
  now,
  stale,
  directoryIncomplete,
  catalog,
  draft,
  notice,
  onDraft,
  actions,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = agentWorker(item, catalog);
  const delivery = itemDelivery(item, notice);
  const locked = responseLocked(item, { stale, busy, delivery });
  const { valid, label: submitLabel } = responseSubmission(item.form, draft);
  const snooze = snoozeAction(item, now);
  const parent = parentTitle(item);
  const submit = async (work: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
    } catch {
      setActionError(AGENTS_COPY.actionError);
    } finally {
      setBusy(false);
    }
  };
  const run = (work: () => Promise<void>) => {
    submit(work).catch(() => undefined);
  };
  return (
    <div
      data-testid="request-detail"
      className="h-full min-h-0 space-y-5 overflow-y-auto p-6"
    >
      <header className="space-y-2.5">
        <SectionLabel>
          {item.requestId ? "Awaiting your response" : "Agent activity"}
        </SectionLabel>
        <h2 className="text-xl leading-snug font-semibold">
          {itemTitle(item)}
        </h2>
        <p
          aria-label={detailMetaLabel(item, worker, now)}
          className="text-sm text-muted-foreground"
        >
          {item.requestId ? `${item.agentTitle} · ` : ""}
          <span className="text-foreground">
            {worker.modelLabel ?? worker.providerLabel}
          </span>
          {" · "}
          {item.bucket} · {ageLabel(item.since, now)}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.projectName} / {item.concertName}
        </p>
      </header>
      {parent && (
        <section
          data-testid="parent-agent"
          className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-4"
        >
          <SectionLabel>Parent agent</SectionLabel>
          <p className="text-sm font-medium">{parent}</p>
          {item.parentAgentTitle && item.parentAgentId && (
            <OpenAgent
              label="Open parent"
              onOpen={() => {
                if (item.parentAgentId) {
                  actions.openAgent(item.parentAgentId);
                }
              }}
            />
          )}
        </section>
      )}
      {item.error && <Notice warning>{item.error}</Notice>}
      {stale && <Notice warning>{AGENTS_COPY.detailStale}</Notice>}
      {delivery && (
        <Notice warning={delivery === "unknown"}>
          {DELIVERY_MESSAGES[delivery]}
        </Notice>
      )}
      {actionError && <Notice warning>{actionError}</Notice>}
      {item.description !== "" && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap select-text">
          {item.description}
        </p>
      )}
      {item.form && (
        <QuestionForm
          form={item.form}
          draft={draft}
          disabled={locked}
          onChange={onDraft}
        />
      )}
      {item.form && item.form.kind !== "native" && (
        <div className="space-y-2">
          <Button
            type="button"
            disabled={!valid || locked}
            onClick={() => {
              if (draft) {
                run(() => actions.answer(item, draft));
              }
            }}
          >
            {delivery === "sending" ? "Sending…" : submitLabel}
          </Button>
          <p className="text-xs text-muted-foreground">
            {AGENTS_COPY.responseScope}
          </p>
        </div>
      )}
      {!item.requestId && <TurnOutcome item={item} />}
      <div className="flex flex-wrap gap-2">
        <OpenAgent
          label="Open agent"
          onOpen={() => actions.openAgent(item.agentId)}
        />
        {snooze && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={stale || busy}
            onClick={() => run(() => actions.snooze(item, snooze.minutes))}
          >
            <Icon name="Clock" aria-hidden />
            {snooze.label}
          </Button>
        )}
        {!item.requestId && item.marked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={stale || busy}
            onClick={() => run(() => actions.mark(item))}
          >
            Clear my reminder
          </Button>
        )}
      </div>
      <ArchiveAction
        key={`${item.key}:${item.archiveKey}`}
        item={item}
        stale={stale}
        directoryIncomplete={directoryIncomplete}
        archive={actions.archive}
      />
      <p className="text-xs text-muted-foreground">{snoozeNote("bb")}</p>
      {item.details !== "" && item.form?.kind !== "native" && (
        <Disclosure
          label={detailsOpen ? "Hide request details" : "Show request details"}
          expanded={detailsOpen}
          onToggle={() => setDetailsOpen(!detailsOpen)}
        >
          <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground select-text">
            {item.details}
          </pre>
        </Disclosure>
      )}
    </div>
  );
}

function OpenAgent({
  label,
  onOpen,
}: {
  label: string;
  onOpen(this: void): void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onOpen}>
      {label}
      <Icon name="ExternalLink" aria-hidden />
    </Button>
  );
}

function TurnOutcome({ item }: { item: AgentItem }) {
  const outcome = turnOutcome(item);
  return (
    <section className="space-y-2">
      <SectionLabel>Turn outcome</SectionLabel>
      <p className="text-sm">{outcome.summary}</p>
      <p className="text-sm text-muted-foreground">{outcome.explanation}</p>
      <p className="text-xs text-muted-foreground">
        {AGENTS_COPY.turnCompletion}
      </p>
    </section>
  );
}
