import { useEffect, useState } from "react";
import { cliNames, type Maintenance } from "essentials/cli-maintenance";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ICONS } from "../../shared/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage, useCall, useQuery } from "../data";
import { CliRow } from "./cli-row";
import { ModelsSection } from "./models";

const BUSY_POLL_MS = 1_000;
const IDLE_POLL_MS = 10_000;
const CHECKING = "Checking CLI updates…";

/**
 * The Essentials page's Harnesses tab: coding CLI versions and updates, and
 * the bb model catalog per CLI. Work runs on the bb server's machine.
 */
export function HarnessesView() {
  const call = useCall();
  const [fast, setFast] = useState(false);
  const status = useQuery(
    "cli.status",
    {},
    { pollMs: fast ? BUSY_POLL_MS : IDLE_POLL_MS },
  );
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const data = status.data;
  const isServerBusy = data?.busy === true;
  useEffect(() => {
    setFast(isServerBusy);
  }, [isServerBusy]);
  const busy = pending || isServerBusy;
  const { set } = status;

  async function run(work: () => Promise<Maintenance>) {
    setPending(true);
    setActionError(null);
    try {
      set(await work());
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  const start = (work: () => Promise<Maintenance>) => {
    run(work).catch(() => undefined);
  };

  const updateCount = data?.rows.filter((row) => row.canUpdate).length ?? 0;
  const action = data?.action ?? "";
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Harnesses</h2>
        <p className="text-xs text-muted-foreground">
          Updates and model refreshes apply to the machine that runs the bb
          server.
        </p>
      </div>
      {(isServerBusy || data?.message) && (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm"
        >
          {isServerBusy && (
            <Icon name="Loading" aria-hidden className="size-4 animate-spin" />
          )}
          <span className="flex-1">
            {isServerBusy ? action : data?.message}
          </span>
        </div>
      )}
      {(status.error || actionError) && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {actionError ??
              "Could not reach the Essentials server. Check that the plugin is running and try again."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setActionError(null);
              status.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      <Tabs defaultValue="updates">
        <TabsList aria-label="Harnesses view">
          <TabsTrigger value="updates">
            {updateCount ? `Updates · ${updateCount}` : "Updates"}
          </TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>
        <TabsContent value="updates" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Installed harnesses</h3>
              <p className="text-xs text-muted-foreground">
                {updateCount
                  ? `${updateCount} updates available`
                  : "Codex, Claude Code, OpenCode and Pi"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || data === null}
              onClick={() => start(() => call("cli.check", {}))}
            >
              <Icon name={ICONS.refresh} aria-hidden />
              {isServerBusy && action === CHECKING
                ? "Checking…"
                : "Check for updates"}
            </Button>
          </div>
          {data === null && status.loading && (
            <p className="text-sm text-muted-foreground">Loading CLI status…</p>
          )}
          {data?.rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Check for updates to compare your installed versions with the
              latest releases.
            </p>
          )}
          <ul className="divide-y">
            {data?.rows.map((row) => (
              <CliRow
                key={row.id}
                row={row}
                busy={busy}
                updating={
                  isServerBusy && action === `Updating ${cliNames[row.id]}…`
                }
                onUpdate={() =>
                  start(() =>
                    call("cli.update", {
                      id: row.id,
                      version: row.latest ?? "",
                    }),
                  )
                }
              />
            ))}
          </ul>
          {data?.checkedAt && (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Last checked{" "}
              {new Date(data.checkedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </TabsContent>
        <TabsContent value="models" className="pt-3">
          <ModelsSection
            busy={busy}
            action={action}
            onRefresh={(id) => start(() => call("cli.models.refresh", { id }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
