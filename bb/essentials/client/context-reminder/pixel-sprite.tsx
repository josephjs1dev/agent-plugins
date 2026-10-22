import { useMemo } from "react";
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
    <div
      role="img"
      aria-label={`${character === "girl" ? "Girl" : "Boy"} assistant, ${mood}`}
      className="shrink-0"
    >
      {rows.map((runs, y) => (
        <div key={y} className="flex" style={{ height: pixelSize }}>
          {runs.map((run, x) => (
            <div
              key={x}
              style={{
                width: run.width * pixelSize,
                height: pixelSize,
                backgroundColor: run.color ?? "transparent",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
