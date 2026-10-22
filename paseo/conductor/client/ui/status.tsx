import { Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { StatusColor, StatusPresentation } from "conductor/podium/status";

/** Resolve a status color role against the active theme. */
export function statusColor(theme: PluginTheme, color: StatusColor): string {
  return theme.colors[color];
}

/**
 * A visible icon plus the presentation's label; the icon is hidden from
 * assistive technology so the text carries the accessible name.
 */
export function StatusMarker({
  theme,
  presentation,
  size = 16,
}: {
  theme: PluginTheme;
  presentation: StatusPresentation;
  size?: number;
}) {
  const color = statusColor(theme, presentation.color);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        aria-hidden
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name={presentation.icon} size={size} color={color} />
      </View>
      <Text
        style={{
          color,
          fontSize: 12,
          lineHeight: size,
          fontWeight: "500",
        }}
      >
        {presentation.label}
      </Text>
    </View>
  );
}
