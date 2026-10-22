import type { AgentItem, AgentsSnapshot } from "conductor/agents/models";
import { visibleItems } from "conductor/agents/attention";
import {
  AGENTS_COPY,
  canShowAll,
  detailPlaceholder,
  nextAttentionItem,
  queueEmptyState,
  scopedAgentCount,
} from "conductor/podium/agents-view";
import type { PodiumSession } from "conductor/podium/session";
import { cn } from "@/lib/utils";
import { usePodium, useNow, useViewState } from "../podium/context";
import { Notice, SectionLabel } from "../ui/notice";
import { useElementWidth } from "../ui/use-element-width";
import { useDetailActions } from "./actions";
import { useAgents, useProviderCatalog } from "./query";
import { Queue } from "./queue";
import { RequestDetail } from "./request-detail";
import { AgentsToolbar } from "./toolbar";

/** Below this width the queue and the detail take turns, as in Paseo. */
const COMPACT_WIDTH = 740;

/** Each Podium session's queue scroll offset, kept across tab switches. */
const scrolls = new WeakMap<PodiumSession, { offset: number }>();

function queueScroll(session: PodiumSession) {
  let scroll = scrolls.get(session);
  if (!scroll) {
    scroll = { offset: 0 };
    scrolls.set(session, scroll);
  }
  return scroll;
}

/** The Agents queue and request detail. */
export function AgentsSection() {
  const { session, openAgent } = usePodium();
  const state = useViewState();
  const now = useNow();
  const agents = useAgents();
  const catalog = useProviderCatalog();
  const actions = useDetailActions(agents.refetch);
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const scroll = queueScroll(session);
  const data: AgentsSnapshot | null = agents.data;
  const stale = agents.error !== null;
  const compact = width > 0 && width < COMPACT_WIDTH;
  const hasSelection = Boolean(state.selectedKey);
  const all = data?.items ?? [];
  const items = visibleItems(
    all,
    state.filter,
    state.query,
    undefined,
    now,
    state.showSnoozed,
  );
  const selected = all.find((item) => item.key === state.selectedKey);
  const attention = visibleItems(all, "attention", "", undefined, now);
  const agentCount = scopedAgentCount(all, undefined);
  const next = nextAttentionItem(attention, selected?.key, state.notices);
  // A native request has no form here; its agent's thread answers it.
  const select = (item: AgentItem) => {
    if (item.form?.kind === "native") {
      openAgent(item.agentId);
      return;
    }
    session.select(item);
  };
  const empty = queueEmptyState({
    available: Boolean(data) && !stale,
    query: state.query,
    filter: state.filter,
    agentCount,
    incomplete: data?.incomplete ?? false,
    hostName: "bb",
  });
  return (
    <div ref={measure} className="flex h-full min-h-0 flex-col">
      <AgentsToolbar
        data={data}
        stale={stale}
        now={now}
        compact={compact}
        hasSelection={hasSelection}
        hasNext={Boolean(next)}
        onNext={() => {
          if (next) {
            session.update({ filter: "attention", query: "" });
            select(next);
          }
        }}
        onRefresh={agents.refetch}
        onFilterChange={() => {
          scroll.offset = 0;
        }}
      />
      {agents.loading && !data ? (
        <div className="p-6">
          <Notice>{AGENTS_COPY.loading}</Notice>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1",
            compact ? "flex-col" : "flex-row",
          )}
        >
          {(!compact || !hasSelection) && (
            <div
              className={cn(
                "min-h-0",
                compact ? "flex-1" : "w-[39%] shrink-0 border-r border-border",
              )}
            >
              <Queue
                items={items}
                now={now}
                selectedKey={state.selectedKey}
                groupBy={state.groupBy}
                catalog={catalog}
                onSelect={select}
                scroll={scroll}
                emptyTitle={empty.title}
                emptyDescription={empty.description}
                showAll={canShowAll(agentCount, state.filter, state.query)}
                onShowAll={() => {
                  session.update({
                    filter: "all",
                    query: "",
                    selectedKey: null,
                  });
                  scroll.offset = 0;
                }}
              />
            </div>
          )}
          {(!compact || hasSelection) && (
            <div className="min-h-0 min-w-0 flex-1">
              {selected ? (
                <RequestDetail
                  key={selected.key}
                  item={selected}
                  now={now}
                  stale={stale}
                  directoryIncomplete={data?.incomplete ?? true}
                  catalog={catalog}
                  draft={state.drafts[selected.key]}
                  notice={state.notices[selected.key]}
                  onDraft={(value) => session.draft(selected.key, value)}
                  actions={actions}
                />
              ) : (
                <DetailPlaceholder
                  hasAttention={attention.length > 0}
                  selectedKey={state.selectedKey}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPlaceholder({
  hasAttention,
  selectedKey,
}: {
  hasAttention: boolean;
  selectedKey: string | null;
}) {
  const copy = detailPlaceholder(hasAttention, selectedKey);
  return (
    <div className="max-w-[620px] space-y-2.5 p-7">
      <SectionLabel>{copy.label}</SectionLabel>
      <p className="text-xl">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.description}</p>
    </div>
  );
}
