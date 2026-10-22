import { useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { AgentItem, AgentsSnapshot } from "conductor/agents/models";
import type { StoredSymphony } from "conductor/symphonies/models";
import { visibleItems } from "conductor/agents/attention";
import {
  AGENTS_COPY,
  canShowAll,
  detailPlaceholder,
  nextAttentionItem,
  queueEmptyState,
  scopedAgentCount,
} from "conductor/podium/agents-view";
import { PodiumSession } from "conductor/podium/session";
import { Label, Notice } from "../ui/controls";
import { PodiumToolbar } from "./toolbar";
import { Queue } from "../agents/queue";
import { RequestDetail, type DetailActions } from "../agents/request-detail";
import type { SymphoniesData } from "../symphonies/list";
import { SymphonyBrowser } from "../symphonies/browser";
import { ProfileBrowser, type ProfilesData } from "../symphonies/profiles";

export interface PodiumViewProps {
  theme: PluginTheme;
  hostLabel: string;
  compact: boolean;
  concertId?: string;
  data: AgentsSnapshot | undefined;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  now: number;
  session: PodiumSession;
  scroll: { offset: number };
  actions: DetailActions;
  symphonies?: SymphoniesData;
  profiles?: ProfilesData;
  deleteSymphony?: (symphony: StoredSymphony) => Promise<void>;
  refresh(this: void): void;
}
export function PodiumView(props: PodiumViewProps) {
  const { theme, data, session, now, actions } = props;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [width, setWidth] = useState(0);
  const compact = props.compact || (width > 0 && width < 740);
  const hasSelection = Boolean(state.selectedKey);
  const isSymphonies =
    state.section === "symphonies" && Boolean(props.symphonies);
  const isProfiles = state.section === "profiles" && Boolean(props.profiles);
  const showAgents = !isSymphonies && !isProfiles;
  const items = visibleItems(
    data?.items ?? [],
    state.filter,
    state.query,
    props.concertId,
    now,
    state.showSnoozed,
  );
  const selected = data?.items.find((item) => item.key === state.selectedKey);
  const attention = visibleItems(
    data?.items ?? [],
    "attention",
    "",
    props.concertId,
    now,
  );
  const agentCount = scopedAgentCount(data?.items ?? [], props.concertId);
  const showAll = () => {
    session.update({
      filter: "all",
      query: "",
      selectedKey: null,
    });
    props.scroll.offset = 0;
  };
  const next = nextAttentionItem(attention, selected?.key, state.notices);
  const select = (item: AgentItem) => {
    if (item.form?.kind === "native" && actions.canNavigate) {
      actions.openAgent(item.agentId);
      return;
    }
    session.select(item);
  };
  const selectNext = () => {
    if (next) {
      session.update({ filter: "attention", query: "" });
      select(next);
    }
  };
  const empty = queueEmptyState({
    available: Boolean(data) && !props.stale,
    query: state.query,
    filter: state.filter,
    agentCount,
    incomplete: data?.incomplete ?? false,
    hostName: "Paseo",
  });
  const placeholder = detailPlaceholder(
    attention.length > 0,
    state.selectedKey,
  );
  return (
    <View
      testID="conductor-podium"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 }}
    >
      <PodiumToolbar
        {...props}
        compact={compact}
        hasNext={Boolean(next)}
        selectNext={selectNext}
      />
      {props.symphonies && (
        <View
          style={{
            flex: 1,
            minHeight: 0,
            display: isSymphonies ? "flex" : "none",
          }}
        >
          <SymphonyBrowser
            theme={theme}
            now={now}
            data={props.symphonies}
            state={state}
            session={session}
            compact={compact}
            {...(props.profiles ? { profiles: props.profiles } : {})}
            {...(props.concertId ? { concertId: props.concertId } : {})}
            {...(actions.canNavigate
              ? { openAgent: (id: string) => actions.openAgent(id) }
              : {})}
            {...(props.deleteSymphony
              ? { deleteSymphony: props.deleteSymphony }
              : {})}
          />
        </View>
      )}
      {props.profiles && (
        <View
          style={{
            flex: 1,
            minHeight: 0,
            display: isProfiles ? "flex" : "none",
          }}
        >
          <ProfileBrowser
            theme={theme}
            data={props.profiles}
            state={state}
            session={session}
            compact={compact}
          />
        </View>
      )}
      <View
        style={{
          flex: 1,
          minHeight: 0,
          display: showAgents ? "flex" : "none",
        }}
      >
        {props.loading && !data ? (
          <View style={{ padding: 24 }}>
            <Notice theme={theme}>{AGENTS_COPY.loading}</Notice>
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              flexDirection: compact ? "column" : "row",
              minHeight: 0,
            }}
          >
            {(!compact || !hasSelection) && (
              <View
                style={{
                  flex: compact ? 1 : undefined,
                  width: compact ? "100%" : "39%",
                  borderRightWidth: compact ? 0 : 1,
                  borderRightColor: theme.colors.border,
                }}
              >
                <Queue
                  items={items}
                  emptyTitle={empty.title}
                  emptyDescription={empty.description}
                  onShowAll={showAll}
                  showAll={canShowAll(agentCount, state.filter, state.query)}
                  theme={theme}
                  now={now}
                  selectedKey={state.selectedKey}
                  groupBy={state.groupBy}
                  scroll={props.scroll}
                  {...(props.profiles
                    ? { catalog: props.profiles.providers }
                    : {})}
                  onSelect={select}
                />
              </View>
            )}
            {(!compact || hasSelection) && (
              <View style={{ flex: 1, minWidth: 0 }}>
                {selected ? (
                  <RequestDetail
                    key={selected.key}
                    theme={theme}
                    item={selected}
                    now={now}
                    stale={props.stale}
                    directoryIncomplete={data?.incomplete ?? true}
                    {...(props.profiles
                      ? { catalog: props.profiles.providers }
                      : {})}
                    draft={state.drafts[selected.key]}
                    notice={state.notices[selected.key]}
                    onDraft={(value) => session.draft(selected.key, value)}
                    actions={actions}
                  />
                ) : (
                  <View style={{ padding: 28, gap: 10, maxWidth: 620 }}>
                    <Label theme={theme}>
                      {placeholder.label.toUpperCase()}
                    </Label>
                    <Text
                      style={{
                        color: theme.colors.foreground,
                        fontSize: 20,
                        lineHeight: 29,
                      }}
                    >
                      {placeholder.title}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.foregroundMuted,
                        fontSize: 14,
                        lineHeight: 23,
                      }}
                    >
                      {placeholder.description}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
