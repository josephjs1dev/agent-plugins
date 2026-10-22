import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type {
  AnswerResult,
  ArchiveResult,
  Decision,
  AgentItem,
} from "conductor/agents/models";
import type { ProviderCatalog } from "../../shared/symphonies/profiles-rpc";
import { ageLabel } from "conductor/agents/attention";
import { ArchiveAction } from "./archive-action";
import { Button, Label, Notice, rowStyle } from "../ui/controls";
import { HarnessMark } from "../ui/harness-mark";
import { QuestionForm } from "./question-form";
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
} from "conductor/podium/agents-view";

export interface DetailActions {
  openAgent(agentId: string): void;
  canNavigate: boolean;
  answer(item: AgentItem, decision: Decision): Promise<void>;
  snooze(item: AgentItem, minutes: 0 | 15 | 60): Promise<void>;
  mark(item: AgentItem): Promise<void>;
  archive(this: void, item: AgentItem): Promise<ArchiveResult>;
}
interface Props {
  theme: PluginTheme;
  item: AgentItem;
  now: number;
  stale: boolean;
  directoryIncomplete: boolean;
  /** The provider catalog, for catalog labels in the worker line. */
  catalog?: ProviderCatalog | undefined;
  draft: Decision | undefined;
  notice: AnswerResult["status"] | "sending" | undefined;
  onDraft(this: void, value: Decision): void;
  actions: DetailActions;
}
export function RequestDetail({
  theme,
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
  const snooze = snoozeAction(item, now);
  const outcome = turnOutcome(item);
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
  const { valid, label: submitLabel } = responseSubmission(item.form, draft);
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, gap: 20 }}
      testID="request-detail"
    >
      <View style={{ gap: 10 }}>
        <Label theme={theme}>
          {item.requestId ? "AWAITING YOUR RESPONSE" : "AGENT ACTIVITY"}
        </Label>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 22,
            lineHeight: 29,
            fontWeight: "600",
            color: theme.colors.foreground,
          }}
        >
          {itemTitle(item)}
        </Text>
        {/* The queue card's worker line, inline with the bucket and age
            metadata: the mark in brand colors instead of the raw provider
            text, the catalog's model label — a raw id while the catalog has
            no entry — and the provider in the accessible label. */}
        <View
          testID="detail-worker"
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <View style={{ flexShrink: 0 }}>
            <HarnessMark
              provider={item.provider}
              label={worker.providerLabel}
              size={14}
              color={theme.colors.foreground}
              tone="brand"
              surface={theme.colors.surface2}
            />
          </View>
          <Text
            accessibilityLabel={detailMetaLabel(item, worker, now)}
            style={{
              fontSize: 13,
              lineHeight: 20,
              color: theme.colors.foregroundMuted,
            }}
          >
            {item.requestId ? `${item.agentTitle} · ` : ""}
            {/* The model — or the provider while no model is recorded — reads
                in the foreground like every worker line; the agent title,
                bucket and age keep their muted metadata tone. */}
            <Text style={{ color: theme.colors.foreground }}>
              {worker.modelLabel ?? worker.providerLabel}
            </Text>
            {" · "}
            {item.bucket} · {ageLabel(item.since, now)}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
          {item.projectName} / {item.concertName}
        </Text>
      </View>
      {item.parentAgentId && (
        <View
          testID="parent-agent"
          style={{
            padding: 16,
            gap: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
            backgroundColor: theme.colors.surface1,
          }}
        >
          <Label theme={theme}>PARENT AGENT</Label>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 14,
              lineHeight: 21,
              fontWeight: "500",
            }}
          >
            {parent}
          </Text>
          {item.parentAgentTitle && (
            <View style={{ alignItems: "flex-start" }}>
              <Button
                theme={theme}
                label="Open parent ↗"
                disabled={!actions.canNavigate}
                onPress={() => {
                  if (item.parentAgentId) {
                    actions.openAgent(item.parentAgentId);
                  }
                }}
              />
            </View>
          )}
        </View>
      )}
      {item.error && (
        <Notice theme={theme} warning>
          {item.error}
        </Notice>
      )}
      {stale && (
        <Notice theme={theme} warning>
          {AGENTS_COPY.detailStale}
        </Notice>
      )}
      {delivery && (
        <Notice theme={theme} warning={delivery === "unknown"}>
          {DELIVERY_MESSAGES[delivery]}
        </Notice>
      )}
      {actionError && (
        <Notice theme={theme} warning>
          {actionError}
        </Notice>
      )}
      {item.description !== "" && (
        <Text
          selectable
          style={{
            fontSize: 14,
            lineHeight: 23,
            color: theme.colors.foreground,
          }}
        >
          {item.description}
        </Text>
      )}
      {item.form && (
        <QuestionForm
          form={item.form}
          theme={theme}
          draft={draft}
          disabled={locked}
          onChange={onDraft}
        />
      )}
      {item.form && item.form.kind !== "native" && (
        <View style={{ gap: 8 }}>
          <Button
            theme={theme}
            label={delivery === "sending" ? "Sending…" : submitLabel}
            primary
            disabled={!valid || locked}
            onPress={() => {
              if (draft) {
                submit(() => actions.answer(item, draft)).catch(
                  () => undefined,
                );
              }
            }}
          />
          <Text
            style={{
              fontSize: 12,
              lineHeight: 19,
              color: theme.colors.foregroundMuted,
            }}
          >
            {AGENTS_COPY.responseScope}
          </Text>
        </View>
      )}
      {!item.requestId && (
        <View style={{ gap: 8 }}>
          <Label theme={theme}>TURN OUTCOME</Label>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 14,
              lineHeight: 22,
            }}
          >
            {outcome.summary}
          </Text>
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 13,
              lineHeight: 21,
            }}
          >
            {outcome.explanation}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {AGENTS_COPY.turnCompletion}
          </Text>
        </View>
      )}
      <View style={rowStyle}>
        <Button
          theme={theme}
          label="Open agent ↗"
          disabled={!actions.canNavigate}
          onPress={() => actions.openAgent(item.agentId)}
        />
        {snooze && (
          <Button
            theme={theme}
            label={snooze.label}
            disabled={stale || busy}
            onPress={() => {
              submit(() => actions.snooze(item, snooze.minutes)).catch(
                () => undefined,
              );
            }}
          />
        )}
        {!item.requestId && item.marked && (
          <Button
            theme={theme}
            label="Clear my reminder"
            disabled={stale || busy}
            onPress={() => {
              submit(() => actions.mark(item)).catch(() => undefined);
            }}
          />
        )}
      </View>
      <ArchiveAction
        key={`${item.key}:${item.archiveKey}`}
        theme={theme}
        item={item}
        stale={stale}
        directoryIncomplete={directoryIncomplete}
        archive={actions.archive}
      />
      {!actions.canNavigate && (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          Agent navigation is unavailable on this client.
        </Text>
      )}
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 19,
        }}
      >
        {snoozeNote("Paseo")}
      </Text>
      {item.details !== "" && item.form?.kind !== "native" && (
        <View style={{ gap: 12 }}>
          <Button
            theme={theme}
            label={
              detailsOpen ? "Hide request details" : "Show request details"
            }
            onPress={() => setDetailsOpen(!detailsOpen)}
          />
          {detailsOpen && (
            <Text
              selectable
              style={{
                color: theme.colors.foregroundMuted,
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 19,
              }}
            >
              {item.details}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
