/**
 * Virtual list hook — windowed rendering for large datasets (100k+ rows).
 * Pure client logic; renders only the visible slice plus overscan.
 *
 * The container ref is supplied BY the caller so React Compiler can track it
 * statically (refs are only touched in effects/event handlers, never render).
 */

import { useEffect, useMemo, useState } from "react";

export type VirtualListState<T> = {
  start: number;
  end: number;
  offsetY: number;
  totalHeight: number;
  onScroll: () => void;
  visible: T[];
};

export function useVirtualList<T>(
  items: T[],
  containerRef: React.RefObject<HTMLDivElement | null>,
  opts?: {
    rowHeight?: number;
    overscan?: number;
  }
): VirtualListState<T> {
  const rowHeight = opts?.rowHeight || 48;
  const overscan = opts?.overscan || 10;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const totalHeight = Math.max(0, items.length * rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );
  const offsetY = start * rowHeight;

  const visible = useMemo(() => items.slice(start, end), [items, start, end]);

  return {
    start,
    end,
    offsetY,
    totalHeight,
    visible,
    onScroll: () => setScrollTop(containerRef.current?.scrollTop ?? 0),
  };
}
