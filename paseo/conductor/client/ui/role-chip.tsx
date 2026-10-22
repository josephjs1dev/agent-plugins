import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { themeAppearance } from "./card";
import { ROLE_CHIP_COLORS, roleLabel } from "conductor/podium/roles";

/**
 * A role chip tints with the role's pair for the current appearance; a role
 * without a pair keeps the neutral surface, like the size badge beside it.
 */
export function RoleChip({
  theme,
  role,
  label,
  testID,
}: {
  theme: PluginTheme;
  role: string;
  /** Defaults to the role's display label, falling back to the raw id. */
  label?: string;
  testID?: string;
}) {
  const tint = ROLE_CHIP_COLORS[role]?.[themeAppearance(theme)];
  return (
    <View
      {...(testID ? { testID } : {})}
      style={{
        minHeight: 22,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tint ? "transparent" : theme.colors.border,
        backgroundColor: tint ? tint.background : theme.colors.surface2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: tint ? tint.foreground : theme.colors.foreground,
          fontSize: 11,
          lineHeight: 15,
        }}
      >
        {label ?? roleLabel(role)}
      </Text>
    </View>
  );
}
