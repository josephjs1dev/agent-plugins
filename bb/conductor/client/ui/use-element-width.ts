import { useCallback, useState, type RefCallback } from "react";

/**
 * An element's measured width in CSS pixels, 0 before the first layout.
 * Attach the returned callback ref to the element to measure.
 */
export function useElementWidth<T extends HTMLElement>(): [
  RefCallback<T>,
  number,
] {
  const [width, setWidth] = useState(0);
  const ref = useCallback<RefCallback<T>>((element) => {
    if (!element) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
