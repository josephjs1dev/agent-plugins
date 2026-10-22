import type { RoutingRole, RoutingSize } from "../symphonies/routing";

/** Display labels for the routing roles. */
export const ROLE_LABELS: Record<RoutingRole, string> = {
  exploration: "Exploration",
  implementation: "Implementation",
  planning: "Planning",
  review: "Review",
};

/** Display labels for the routing sizes. */
export const SIZE_LABELS: Record<RoutingSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** A role's display label; an unknown role keeps its raw id. */
export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string | undefined>)[role] ?? role;
}

/** A size's display label; an unknown size keeps its raw id. */
export function sizeLabel(size: string): string {
  return (SIZE_LABELS as Record<string, string | undefined>)[size] ?? size;
}

/**
 * Role chip background/text pairs per role and appearance. Each pair holds
 * WCAG AA (4.5:1) text contrast on its own background; the browser suite
 * measures the rendered pair in both themes.
 */
export const ROLE_CHIP_COLORS: Record<
  string,
  Record<"light" | "dark", { background: string; foreground: string }>
> = {
  exploration: {
    light: { background: "#e0f4f1", foreground: "#1f6b5e" },
    dark: { background: "#183631", foreground: "#8fdccb" },
  },
  implementation: {
    light: { background: "#e3eefb", foreground: "#245e98" },
    dark: { background: "#1d3047", foreground: "#9ac7ff" },
  },
  planning: {
    light: { background: "#efe7fb", foreground: "#5b3a99" },
    dark: { background: "#2f2545", foreground: "#cdb8f5" },
  },
  review: {
    light: { background: "#fbf0dc", foreground: "#7a4f00" },
    dark: { background: "#3a2e17", foreground: "#ecc779" },
  },
};
