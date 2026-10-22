/** A short local time, such as 3:40 PM. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** When the next card is due, from the state's `nextCardInTurns`. */
export function nextCardLabel(turns: number): string {
  if (turns <= 0) {
    return "Next reminder after this turn";
  }
  return turns === 1
    ? "Next reminder in 1 turn"
    : `Next reminder in ${turns} turns`;
}
