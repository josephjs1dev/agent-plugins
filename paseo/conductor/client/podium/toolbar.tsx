import { useState, useSyncExternalStore } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { AgentsSnapshot } from "conductor/agents/models";
import { visibleItems } from "conductor/agents/attention";
import {
  AGENTS_COPY,
  agentCoverage,
  receiptLine,
  refreshStamp,
  scopedAgentCount,
  scopedItems,
  showSnoozedToggle,
} from "conductor/podium/agents-view";
import type { PodiumSession, ViewState } from "conductor/podium/session";
import { Button, Label, Notice, rowStyle } from "../ui/controls";
import {
  symphonyCountLabel,
  visibleSymphonies,
} from "conductor/podium/symphony-list";
import type { SymphoniesData } from "../symphonies/list";
import { SymphonyToolbar } from "../symphonies/toolbar";
import type { ProfilesData } from "../symphonies/profiles";
import { RefreshButton } from "../ui/refresh-button";
import { AGENT_FILTERS } from "conductor/podium/agents";

interface Props {
  theme: PluginTheme;
  hostLabel: string;
  concertId?: string;
  data: AgentsSnapshot | undefined;
  symphonies?: SymphoniesData;
  profiles?: ProfilesData;
  session: PodiumSession;
  compact: boolean;
  stale: boolean;
  refreshing: boolean;
  now: number;
  hasNext: boolean;
  scroll: { offset: number };
  refresh(this: void): void;
  selectNext(this: void): void;
}

export function PodiumToolbar(props: Props) {
  const { theme, data, session, compact, now } = props;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [showHistory, setShowHistory] = useState(false);
  const scoped = scopedItems(data?.items ?? [], props.concertId);
  const symphonyCount = visibleSymphonies(
    props.symphonies?.list?.symphonies ?? [],
    { ...state, symphonyQuery: "", symphonyFilter: "all" },
    props.concertId,
  ).length;
  const agentCount = scopedAgentCount(scoped, undefined);
  const reliable = data && !props.stale;
  const controls = { theme, dense: !compact };
  const isSymphonies =
    state.section === "symphonies" && Boolean(props.symphonies);
  const isProfiles = state.section === "profiles" && Boolean(props.profiles);
  const showAgents = !isSymphonies && !isProfiles;
  const selectedProfile = isProfiles ? state.profileSelection : null;
  const selectedSymphony = isSymphonies ? state.symphonySelection : null;
  const hasSelection = Boolean(
    selectedProfile ?? selectedSymphony ?? state.selectedKey,
  );
  const profileCount = props.profiles?.state?.profiles.length ?? 0;
  const backLabel = (): string => {
    if (isProfiles) {
      return "← Back to profiles";
    }
    return isSymphonies ? "← Back to symphonies" : "← Back to queue";
  };
  const back = (): void => {
    if (isProfiles) {
      session.update({ profileSelection: null });
    } else if (isSymphonies) {
      session.update({ symphonySelection: null });
    } else {
      session.update({ selectedKey: null });
    }
  };
  const sections = [
    { id: "agents", label: "Agents", icon: "Users" },
    ...(props.symphonies
      ? [{ id: "symphonies" as const, label: "Symphonies", icon: "Music2" }]
      : []),
    ...(props.profiles
      ? [
          {
            id: "profiles" as const,
            label: "Profiles",
            icon: "SlidersHorizontal",
          },
        ]
      : []),
  ] satisfies {
    id: ViewState["section"];
    label: string;
    icon: string;
  }[];
  return (
    <View
      style={{
        paddingHorizontal: compact ? 16 : 24,
        paddingTop: 18,
        paddingBottom: 14,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          ...rowStyle,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ gap: 5, flexShrink: 1 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.colors.foreground,
              fontSize: 22,
              lineHeight: 28,
              fontWeight: "600",
            }}
          >
            Podium
          </Text>
          <Text
            testID="agent-coverage"
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {props.hostLabel} ·{" "}
            {props.concertId ? "This concert" : "All concerts"}
            {showAgents && data
              ? ` · ${agentCoverage(agentCount, data.incomplete, props.stale)}`
              : ""}
            {isSymphonies && props.symphonies?.list
              ? ` · ${symphonyCountLabel(symphonyCount)}${props.symphonies.stale ? " · last known" : ""}`
              : ""}
          </Text>
        </View>
        <View style={{ ...rowStyle, flexShrink: 1, maxWidth: "100%" }}>
          {compact && hasSelection && (
            <Button
              {...controls}
              label={backLabel()}
              variant="quiet"
              onPress={back}
            />
          )}
          <RefreshButton
            theme={theme}
            refreshing={props.refreshing}
            onPress={props.refresh}
          />
          {showAgents && (
            <Button
              {...controls}
              label="Next item →"
              disabled={!props.hasNext}
              onPress={props.selectNext}
            />
          )}
        </View>
      </View>
      {(props.symphonies || props.profiles) && (
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Podium sections"
          style={{
            ...rowStyle,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {sections.map((section) => (
            <Button
              key={section.id}
              {...controls}
              role="tab"
              variant="tab"
              label={section.label}
              icon={section.icon}
              {...(section.id === "profiles" ? { count: profileCount } : {})}
              selected={state.section === section.id}
              onPress={() => session.update({ section: section.id })}
            />
          ))}
        </View>
      )}
      {showAgents && props.stale && (
        <Notice theme={theme} warning>
          {AGENTS_COPY.stale}
        </Notice>
      )}
      {showAgents && data?.incomplete && (
        <Notice theme={theme} warning>
          {AGENTS_COPY.incomplete}
        </Notice>
      )}
      {showAgents && data?.concertIncomplete && (
        <Notice theme={theme}>{AGENTS_COPY.concertIncomplete}</Notice>
      )}
      {showAgents && data?.turnHistoryIncomplete && (
        <Notice theme={theme} warning>
          {AGENTS_COPY.turnHistoryIncomplete}
        </Notice>
      )}
      {isSymphonies && props.symphonies && (!compact || !hasSelection) && (
        <SymphonyToolbar
          theme={theme}
          data={props.symphonies}
          state={state}
          session={session}
          compact={compact}
          {...(props.concertId ? { concertId: props.concertId } : {})}
        />
      )}
      {showAgents && (!compact || !hasSelection) && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              flexGrow: 0,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
            contentContainerStyle={{ gap: 6 }}
          >
            {AGENT_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                {...controls}
                variant="tab"
                label={filter.label}
                icon={filter.icon}
                selected={state.filter === filter.id}
                {...(reliable
                  ? {
                      count: visibleItems(
                        scoped,
                        filter.id,
                        "",
                        undefined,
                        now,
                        state.showSnoozed,
                      ).length,
                    }
                  : {})}
                onPress={() => {
                  session.update({
                    filter: filter.id,
                    selectedKey: null,
                  });
                  props.scroll.offset = 0;
                }}
              />
            ))}
          </ScrollView>
          <View
            testID="podium-tools"
            style={{ ...rowStyle, alignItems: "center" }}
          >
            <View
              style={{
                flex: 1,
                minWidth: compact ? 220 : 240,
              }}
            >
              <View
                aria-hidden
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 10,
                  top: 0,
                  bottom: 0,
                  justifyContent: "center",
                }}
              >
                <Icon
                  name="Search"
                  size={16}
                  color={theme.colors.foregroundMuted}
                />
              </View>
              <TextInput
                accessibilityLabel="Search agents and requests"
                placeholder="Search agents, requests, concerts…"
                placeholderTextColor={theme.colors.foregroundMuted}
                value={state.query}
                onChangeText={(query) => session.update({ query })}
                style={{
                  height: compact ? 44 : 34,
                  paddingLeft: 32,
                  paddingRight: 10,
                  paddingVertical: 6,
                  color: theme.colors.foreground,
                  backgroundColor: theme.colors.surface1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 6,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              />
            </View>
            <Button
              {...controls}
              label={
                state.groupBy === "project"
                  ? "Group: project"
                  : "Group: concert"
              }
              onPress={() =>
                session.update({
                  groupBy: state.groupBy === "project" ? "concert" : "project",
                })
              }
            />
            <Button
              {...controls}
              variant="quiet"
              label={showHistory ? "Hide recent actions" : "Recent actions"}
              onPress={() => setShowHistory(!showHistory)}
            />
            {showSnoozedToggle(
              state.filter,
              state.showSnoozed,
              scoped,
              now,
            ) && (
              <Button
                {...controls}
                variant="quiet"
                label="Show snoozed"
                selected={state.showSnoozed}
                onPress={() =>
                  session.update({ showSnoozed: !state.showSnoozed })
                }
              />
            )}
          </View>
        </>
      )}
      {showAgents && data && (
        <Text
          style={{
            fontSize: 11,
            lineHeight: 16,
            color: theme.colors.foregroundMuted,
          }}
        >
          {refreshStamp(props.stale, data.fetchedAt)}
        </Text>
      )}
      {showAgents && showHistory && (
        <View style={{ gap: 8 }}>
          <Label theme={theme}>RECENT RESPONSE DELIVERY</Label>
          {data?.receipts.length === 0 && (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {AGENTS_COPY.noReceipts}
            </Text>
          )}
          {data?.receipts.slice(0, 5).map((receipt) => (
            <Text
              key={receipt.key}
              style={{ color: theme.colors.foreground, fontSize: 12 }}
            >
              {receiptLine(receipt, data.items)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
