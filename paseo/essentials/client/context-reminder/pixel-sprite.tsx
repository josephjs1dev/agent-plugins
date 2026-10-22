import { useMemo } from "react";
import { View } from "react-native";
import {
  moodFor,
  toPixelRuns,
  type Character,
} from "essentials/context-reminder/sprite";
import { FRAMES } from "essentials/context-reminder/sprite-frames";
import type { ReminderTier } from "essentials/context-reminder/reminder-policy";

interface PixelSpriteProps {
  character: Character;
  tier: ReminderTier | null;
  pixelSize: number;
}

/** Draws a sprite frame as rows of colored runs; no images. */
export function PixelSprite({ character, tier, pixelSize }: PixelSpriteProps) {
  const mood = moodFor(tier);
  const rows = useMemo(
    () => toPixelRuns(FRAMES[character][mood]),
    [character, mood],
  );

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${character === "girl" ? "Girl" : "Boy"} assistant, ${mood}`}
      style={{ flexShrink: 0 }}
    >
      {rows.map((runs, y) => (
        <View key={y} style={{ flexDirection: "row", height: pixelSize }}>
          {runs.map((run, x) => (
            <View
              key={x}
              style={{
                width: run.width * pixelSize,
                height: pixelSize,
                backgroundColor: run.color ?? "transparent",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
