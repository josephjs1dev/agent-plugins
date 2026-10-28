import type { ReactNode } from "react";
import { experimental_copyToClipboard } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { GitStatus } from "essentials/file-explorer/git";
import { cn } from "@/lib/utils";

type GlyphName =
  | "folder"
  | "file"
  | "chevron"
  | "search"
  | "refresh"
  | "close"
  | "home"
  | "collapse"
  | "copy"
  | "eye"
  | "eyeOff";

const GLYPHS: Record<GlyphName, ReactNode> = {
  folder: <path d="M2.5 6V4.5h5l2 2h8V16h-15Z" />,
  file: (
    <>
      <path d="M5 2.5h6l4 4v11H5Z" />
      <path d="M11 2.5V7h4M7.5 10h5M7.5 13h4" />
    </>
  ),
  chevron: <path d="m7.5 5 5 5-5 5" />,
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4 4" />
    </>
  ),
  refresh: <path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  home: <path d="m3 9 7-6 7 6M5 8v9h10V8M8 17v-5h4v5" />,
  collapse: <path d="m6 3 4 4 4-4M6 17l4-4 4 4" />,
  copy: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M12 7V3H3v9h4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <path d="m3 3 14 14" />
    </>
  ),
};

/** A 20 px line glyph that follows the text color. */
export function Glyph({
  name,
  className,
}: {
  name: GlyphName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      {GLYPHS[name]}
    </svg>
  );
}

export const iconButton =
  "inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The highlight under the pointer. It falls back to a neutral tint where the
 * host theme defines no `--state-hover`.
 */
export const hoverHighlight =
  "hover:bg-[var(--state-hover,rgb(127_127_127/0.14))]";

/** Row actions show on hover or focus, and always on a compact viewport. */
export const rowAction =
  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100";

/** A file glyph tone: code, docs, or other. */
export function fileTone(path: string): string {
  if (/\.(tsx?|jsx?|go|py|rs)$/.test(path)) {
    return "text-sky-500";
  }
  return /\.mdx?$/.test(path) ? "text-violet-400" : "text-muted-foreground";
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

const GIT_DECORATIONS: Record<
  GitStatus,
  { letter: string; label: string; tone: string }
> = {
  conflicted: { letter: "!", label: "Conflicted", tone: "text-red-500" },
  modified: { letter: "M", label: "Modified", tone: "text-amber-500" },
  deleted: { letter: "D", label: "Deleted", tone: "text-red-500" },
  added: { letter: "A", label: "Added", tone: "text-green-500" },
  untracked: { letter: "U", label: "Untracked", tone: "text-green-500" },
  ignored: { letter: "", label: "Ignored by Git", tone: "" },
};

/** The name's class for a Git status: tinted for a change, faded if ignored. */
export function gitNameClass(status: GitStatus | null): string {
  if (!status) {
    return "";
  }
  return status === "ignored" ? "opacity-50" : GIT_DECORATIONS[status].tone;
}

/**
 * A file's status letter, or a dot on a folder that holds changes. Ignored
 * and clean entries show none.
 */
export function GitBadge({
  status,
  directory,
}: {
  status: GitStatus | null;
  directory: boolean;
}) {
  if (!status || status === "ignored") {
    return null;
  }
  const { letter, label, tone } = GIT_DECORATIONS[status];
  return (
    <span
      title={directory ? `Contains changes: ${label.toLowerCase()}` : label}
      aria-label={label}
      className={cn("shrink-0 px-1 text-[10px] font-semibold", tone)}
    >
      {directory ? "●" : letter}
    </span>
  );
}

/** Copies `path`, relative to the workspace root, to the clipboard. */
export async function copyRelativePath(path: string): Promise<void> {
  try {
    if (await experimental_copyToClipboard({ text: path })) {
      toast.success("Relative path copied.");
    } else {
      toast.error(
        "Could not copy the relative path. The clipboard refused the write.",
      );
    }
  } catch {
    toast.error("Could not copy the relative path. Try again.");
  }
}
