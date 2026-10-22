import type { ViewState } from "conductor/podium/session";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { AgentsSection } from "../agents/section";
import { ProfilesSection } from "../profiles/section";
import { SymphoniesSection } from "../symphonies/section";
import { PodiumProvider, usePodium, useViewState } from "./context";

const SECTIONS: {
  id: ViewState["section"];
  label: string;
  icon: string;
}[] = [
  { id: "agents", label: "Agents", icon: "Bot" },
  { id: "symphonies", label: "Symphonies", icon: "Workflow" },
  { id: "profiles", label: "Profiles", icon: "SlidersHorizontal" },
];

function SectionTabs() {
  const { session } = usePodium();
  const { section } = useViewState();
  return (
    <nav
      aria-label="Podium sections"
      className="flex gap-1 border-b border-border px-4 md:px-5"
    >
      {SECTIONS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-current={section === entry.id ? "page" : undefined}
          onClick={() => session.update({ section: entry.id })}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm",
            section === entry.id
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon name={entry.icon} aria-hidden className="size-4" />
          {entry.label}
        </button>
      ))}
    </nav>
  );
}

function Sections() {
  const { section } = useViewState();
  return (
    <div className="min-h-0 flex-1">
      {section === "agents" && <AgentsSection />}
      {section === "symphonies" && <SymphoniesSection />}
      {section === "profiles" && <ProfilesSection />}
    </div>
  );
}

/** The Podium: the Agents queue, Symphonies, and worker Profiles. */
export function PodiumView() {
  return (
    <PodiumProvider>
      <div className="flex h-full min-h-0 flex-col">
        <SectionTabs />
        <Sections />
      </div>
    </PodiumProvider>
  );
}
