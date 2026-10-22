import { useEffect, useRef, useState } from "react";
import { cliIds, cliNames, type CliId } from "essentials/cli-maintenance";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ICONS } from "../../shared/icons";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "../data";
import { CliLogo } from "./cli-row";

const PAGE_SIZE = 8;

interface ModelsSectionProps {
  busy: boolean;
  /** The current host action, to tell when this CLI is refreshing. */
  action: string;
  onRefresh(this: void, id: CliId): void;
}

/** The bb model catalog for one CLI, searchable and paged. */
export function ModelsSection({ busy, action, onRefresh }: ModelsSectionProps) {
  const [provider, setProvider] = useState<CliId>("codex");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const models = useQuery("cli.models", { id: provider });
  const refreshing =
    busy && action === `Refreshing ${cliNames[provider]} models…`;
  const wasRefreshing = useRef(refreshing);
  const { refetch } = models;
  useEffect(() => {
    // Reload the catalog once a refresh of this CLI finishes.
    if (wasRefreshing.current && !refreshing) {
      refetch();
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, refetch]);
  const available = models.data?.models ?? [];
  const needle = search.toLowerCase();
  const filtered = available.filter((model) =>
    `${model.label} ${model.id}`.toLowerCase().includes(needle),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  return (
    <section className="space-y-3">
      <Tabs
        value={provider}
        onValueChange={(value) => {
          setProvider(value as CliId);
          setPage(0);
        }}
      >
        <TabsList aria-label="Model provider">
          {cliIds.map((id) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <CliLogo id={id} />
              {cliNames[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {models.data ? `${available.length} available models` : "Models"}
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onRefresh(provider)}
        >
          <Icon name={ICONS.refresh} aria-hidden />
          {refreshing ? "Refreshing…" : "Refresh models"}
        </Button>
      </div>
      <Input
        aria-label="Search models"
        placeholder="Search by name or model ID"
        value={search}
        maxLength={100}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
      />
      <ModelsStatus
        loading={models.data === null && models.loading}
        error={models.error ?? (models.data?.error || null)}
        empty={models.data !== null && filtered.length === 0}
        searching={search !== ""}
      />
      <ul className="divide-y">
        {shown.map((model) => (
          <li key={model.id} className="space-y-0.5 py-2">
            <p className="text-sm font-medium">{model.label}</p>
            <p className="font-mono text-xs text-muted-foreground select-text">
              {model.id}
            </p>
            {model.description && (
              <p className="text-xs text-muted-foreground">
                {model.description}
              </p>
            )}
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {current * PAGE_SIZE + 1}–
            {Math.min((current + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={current + 1 >= pageCount}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        bb's model catalog for this provider. Project configuration and account
        access may change the models a thread can use.
      </p>
    </section>
  );
}

function ModelsStatus({
  loading,
  error,
  empty,
  searching,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  searching: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading models…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!empty) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {searching
        ? "No matching models. Try another name or ID."
        : "No models listed yet. Try Refresh models."}
    </p>
  );
}
