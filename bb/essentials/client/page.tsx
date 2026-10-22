import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ICONS } from "../shared/icons";
import { HostHistory } from "./history/panel";
import { HarnessesView } from "./maintenance/harnesses";
import { pageTab, useOpenPage, type PageTab } from "./navigation";
import { QuotaOverview } from "./usage/overview";

const TABS: { id: PageTab; label: string; icon: string }[] = [
  { id: "usage", label: "Usage", icon: ICONS.gauge },
  { id: "harnesses", label: "Harnesses", icon: ICONS.wrench },
];

function PageTabs({ current }: { current: PageTab }) {
  const open = useOpenPage();
  return (
    <nav
      aria-label="Essentials sections"
      className="flex gap-1 border-b border-border px-4 md:px-5"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-current={current === tab.id ? "page" : undefined}
          onClick={() => open(tab.id)}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm",
            current === tab.id
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon name={tab.icon} aria-hidden className="size-4" />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/** Host-wide quota and history, and coding CLI maintenance. */
export function EssentialsPage({ subPath }: PluginNavPanelProps) {
  const tab = pageTab(subPath);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageTabs current={tab} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {tab === "usage" && (
            <>
              <QuotaOverview />
              <HostHistory />
            </>
          )}
          {tab === "harnesses" && <HarnessesView />}
        </div>
      </div>
    </div>
  );
}
