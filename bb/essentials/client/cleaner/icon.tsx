import { needsAttention, useCleanerSnapshot } from "./state";

/**
 * The footer broom, with a small dot when old threads wait for review or
 * cleanup needs attention. bb renders it outside the plugin runtime, so it
 * reads the snapshot that CleanerSync publishes and uses no plugin hooks.
 */
export function CleanerIcon({ className }: { className?: string }) {
  const showDot = needsAttention(useCleanerSnapshot());
  return (
    <span
      className={className}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-full"
        aria-hidden="true"
      >
        <path d="M20.5 3.5 L12.5 11.5" />
        <path d="M10.5 9.5 L14.5 13.5 L9.5 20.5 L3.5 14.5 Z" />
        <path d="M9 11 L13 15" />
        <path d="M8.5 13.5 L5.5 16.5 M11 16 L8 19" />
      </svg>
      {showDot ? (
        <span
          className="bg-primary"
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            width: 4,
            height: 4,
            borderRadius: "50%",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}
