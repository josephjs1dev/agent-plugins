import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * The scrolling contents. It restores the saved position on mount. Directory
 * pages load after mount and add height, so it retries until the position
 * fits or the user scrolls.
 */
export function ExplorerScroll({
  position,
  onScroll,
  children,
}: {
  position: number;
  onScroll(this: void, top: number): void;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const target = useRef(position);
  const restoring = useRef(true);
  useLayoutEffect(() => {
    const restore = () => {
      const element = viewport.current;
      if (!element || !restoring.current) {
        return;
      }
      element.scrollTop = target.current;
      if (element.scrollTop >= target.current) {
        restoring.current = false;
      }
    };
    restore();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(restore);
    if (content.current) {
      observer?.observe(content.current);
    }
    return () => observer?.disconnect();
  }, []);
  const stopRestoring = () => {
    restoring.current = false;
  };
  return (
    <div
      ref={viewport}
      aria-label="Explorer contents"
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      onWheel={stopRestoring}
      onTouchStart={stopRestoring}
      onPointerDown={stopRestoring}
      onKeyDown={stopRestoring}
      onScroll={(event) => {
        if (!restoring.current) {
          onScroll(event.currentTarget.scrollTop);
        }
      }}
    >
      <div ref={content}>{children}</div>
    </div>
  );
}
