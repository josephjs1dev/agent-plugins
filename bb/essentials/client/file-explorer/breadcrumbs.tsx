import { Glyph } from "./ui";

/** The search folder, with **All files** and each ancestor to widen it. */
export function Breadcrumbs({
  scope,
  searching,
  onScope,
}: {
  scope: string;
  searching: boolean;
  onScope(this: void, folder: string): void;
}) {
  const crumbs = scope.split("/");
  return (
    <nav
      aria-label="Search location"
      className="flex min-w-0 flex-wrap items-center gap-0.5 text-[11px] text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => onScope("")}
        className="inline-flex h-5 items-center gap-1 rounded px-1 hover:bg-state-hover hover:text-foreground"
      >
        <Glyph name="home" className="size-3" />
        All files
      </button>
      {crumbs.map((crumb, index) => {
        const folder = crumbs.slice(0, index + 1).join("/");
        return (
          <span
            key={folder}
            className="inline-flex min-w-0 items-center gap-0.5"
          >
            <Glyph name="chevron" className="size-2.5" />
            <button
              type="button"
              title={folder}
              className="max-w-32 truncate rounded px-1 hover:bg-state-hover hover:text-foreground"
              onClick={() => onScope(folder)}
            >
              {crumb}
            </button>
          </span>
        );
      })}
      {searching ? (
        <span className="ml-auto pl-1 text-[10px]">Including subfolders</span>
      ) : null}
    </nav>
  );
}
