/**
 * The core's Lucide icon names for filters and tabs as bb icon names. An
 * unmapped name passes through, and `Icon` falls back for unknown names.
 */
const BB_ICONS: Record<string, string> = {
  Activity: "Loading",
  Bell: "BellDot",
  CircleCheck: "CircleCheck",
  CirclePause: "Pause",
  FileText: "FileText",
  GitBranch: "GitBranch",
  History: "TimeSchedule",
  ListChecks: "ListView",
};

export function bbIconName(lucide: string): string {
  return BB_ICONS[lucide] ?? lucide;
}
