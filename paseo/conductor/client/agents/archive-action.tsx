import { useState } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { ArchiveResult, AgentItem } from "conductor/agents/models";
import { Button, rowStyle } from "../ui/controls";
import { archiveErrors } from "conductor/podium/agents";
import {
  AGENTS_COPY,
  archiveBlocked,
  archivePrompts,
  canArchive,
} from "conductor/podium/agents-view";

const errors = archiveErrors("Paseo");
const prompts = archivePrompts("Paseo");

interface Props {
  theme: PluginTheme;
  item: AgentItem;
  stale: boolean;
  directoryIncomplete: boolean;
  archive(this: void, item: AgentItem): Promise<ArchiveResult>;
}
export function ArchiveAction({
  theme,
  item,
  stale,
  directoryIncomplete,
  archive,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  if (!canArchive(item)) {
    return null;
  }
  const blocked = archiveBlocked(item, {
    stale,
    directoryIncomplete,
    busy,
    uncertain,
  });
  const perform = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await archive(item);
      if (result.status !== "archived") {
        setError(errors[result.status]);
        setUncertain(result.status === "unknown");
      }
    } catch {
      setError(errors.unknown);
      setUncertain(true);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      {confirming ? (
        <>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            {prompts.confirm(item.agentTitle)}
          </Text>
          <View style={rowStyle}>
            <Button
              theme={theme}
              label={busy ? "Archiving…" : "Confirm archive"}
              disabled={blocked}
              onPress={() => {
                perform().catch(() => undefined);
              }}
            />
            <Button
              theme={theme}
              label="Cancel archive"
              disabled={busy}
              onPress={() => setConfirming(false)}
            />
          </View>
        </>
      ) : (
        <View style={{ alignItems: "flex-start" }}>
          <Button
            theme={theme}
            label="Archive agent"
            disabled={blocked}
            onPress={() => setConfirming(true)}
          />
        </View>
      )}
      {item.childAgentCount > 0 && (
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {prompts.children}
        </Text>
      )}
      {directoryIncomplete && (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {AGENTS_COPY.archiveIncomplete}
        </Text>
      )}
      {error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.colors.statusDanger, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
