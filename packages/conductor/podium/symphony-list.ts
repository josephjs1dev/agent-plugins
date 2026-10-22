import type { SymphonyListEntry } from "../symphonies/models";
import type { ViewState } from "./session";

/** The Symphonies list filters, in toolbar order, with their Lucide icons. */
export const SYMPHONY_FILTERS: readonly {
  id: ViewState["symphonyFilter"];
  label: string;
  icon: string;
}[] = [
  { id: "blocked", label: "Needs attention", icon: "Bell" },
  { id: "active", label: "Active", icon: "Activity" },
  { id: "completed", label: "Complete", icon: "CircleCheck" },
  { id: "all", label: "All", icon: "ListChecks" },
];

/** True when a search or a status filter narrows the list. */
export function isSymphonyListFiltered(state: ViewState): boolean {
  return Boolean(state.symphonyQuery || state.symphonyFilter !== "all");
}

/** "1 symphony" or "3 symphonies". */
export function symphonyCountLabel(count: number): string {
  return `${count} ${count === 1 ? "symphony" : "symphonies"}`;
}

/**
 * A list row's context line: the concert, unless the project heading already
 * names a concert that shares its name, then the reported-task count.
 */
export function symphonyCaption(symphony: SymphonyListEntry): string {
  const concert =
    symphony.source.concertName !== symphony.projectName
      ? `${symphony.source.concertName} · `
      : "";
  return symphony.status === "planning"
    ? `${concert}Splitting into tasks`
    : `${concert}${symphony.completedTasks} of ${symphony.taskCount} tasks reported complete`;
}

export function visibleSymphonies(
  symphonies: SymphonyListEntry[],
  state: ViewState,
  concertId?: string,
) {
  const query = state.symphonyQuery.toLowerCase().trim();
  return symphonies.filter(
    (symphony) =>
      (!concertId || symphony.source.concertId === concertId) &&
      (state.symphonyFilter === "all" ||
        (state.symphonyFilter === "active" &&
          ["planning", "ready", "running"].includes(symphony.status)) ||
        (state.symphonyFilter === "blocked" &&
          ["blocked", "failed"].includes(symphony.status)) ||
        symphony.status === state.symphonyFilter) &&
      [
        symphony.title,
        symphony.projectName,
        symphony.source.concertName,
        symphony.source.agentId ?? "",
      ].some((value) => value.toLowerCase().includes(query)),
  );
}

/** Groups by project in list order, so the most recent project leads. */
export function symphonyGroups(symphonies: readonly SymphonyListEntry[]) {
  const groups = new Map<string, SymphonyListEntry[]>();
  for (const symphony of symphonies) {
    const group = groups.get(symphony.projectName) ?? [];
    group.push(symphony);
    groups.set(symphony.projectName, group);
  }
  return [...groups].map(([label, entries]) => ({ label, entries }));
}
