'use client';

import { motion, useSpring } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';

import { EASE_QUICK, SPRING_FOLLOW } from '@/lib/motion';

interface HighlightBox {
  readonly top: number;
  readonly height: number;
}

export interface RowRegistry {
  /** Goes on the table body. Must be `position: relative`. */
  readonly container: RefObject<HTMLDivElement>;
  /** The measured row elements, keyed by log id. */
  readonly rows: MutableRefObject<Map<string, HTMLElement>>;
  /** Ref callback for one row. Stable per id, so React does not re-attach. */
  readonly register: (id: string) => (element: HTMLElement | null) => void;
  /** The rendered row for an id, when it is on screen. */
  readonly nodeFor: (id: string) => HTMLElement | null;
}

/**
 * Holds the table's row elements so the wash can measure them.
 *
 * The ref callbacks are cached per id rather than built in render. A fresh
 * closure each time means a changed ref identity, which React answers by
 * detaching and re-attaching *every* row's ref on *every* render of the table —
 * and the table renders on every hover.
 */
export function useRowRegistry(rowsKey: string): RowRegistry {
  const container = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());

  const register = useCallback((id: string) => {
    const cached = callbacks.current.get(id);
    if (cached) return cached;

    const callback = (element: HTMLElement | null) => {
      if (element) rows.current.set(id, element);
      else rows.current.delete(id);
    };

    callbacks.current.set(id, callback);
    return callback;
  }, []);

  const nodeFor = useCallback((id: string) => rows.current.get(id) ?? null, []);

  // Filtering the table changes which rows exist; without this the callback
  // cache would accumulate one entry per log ever displayed in the session.
  useEffect(() => {
    const visible = new Set(rowsKey ? rowsKey.split(',') : []);
    for (const id of callbacks.current.keys()) {
      if (!visible.has(id)) callbacks.current.delete(id);
    }
  }, [rowsKey]);

  return { container, rows, register, nodeFor };
}

interface RowHighlightProps {
  readonly registry: RowRegistry;
  /** The row the wash should be over, or null to fade it out. */
  readonly activeId: string | null;
  /** Changes when the visible rows do, so the measurement is retaken. */
  readonly rowsKey: string;
}

/**
 * The design's #F8F8F8 wash, travelling.
 *
 * One element for the whole table, positioned over whichever row is active. It
 * slides between rows while the pointer stays in the table, and fades rather
 * than flies when the pointer arrives or leaves: the position is set without
 * animating on the frame it becomes visible, so entering the table half way down
 * does not drag the wash across five rows to meet the pointer, and leaving does
 * not send it racing back to the top. That flight back was the flicker — a quick
 * pass over a name started a long journey the pointer had already abandoned.
 *
 * Measured, not `layoutId`. Framer's layout animations diff bounding rects, and
 * this table nearly always has an ancestor mid-animation: opening a row animates
 * a panel's height, which moves every row below it while the wash is still
 * working out where it is going. `offsetTop` and `offsetHeight` are laid-out
 * values relative to the positioned container, so a panel opening above simply
 * reports a larger number and transforms anywhere in the tree do not enter into
 * it.
 *
 * The measurement lives *here* rather than in the table, and that placement is
 * the point: a panel's open animation resizes the container on every frame, and
 * every one of those frames re-measures. Held one level up, each of them would
 * re-render all eleven rows to move one absolutely-positioned div.
 */
export function RowHighlight({ registry, activeId, rowsKey }: RowHighlightProps) {
  const [box, setBox] = useState<HighlightBox | null>(null);

  const top = useSpring(0, SPRING_FOLLOW);
  const height = useSpring(0, SPRING_FOLLOW);
  /** False until the wash is on screen; the first placement is not animated. */
  const visible = useRef(false);

  const { container, rows } = registry;

  useEffect(() => {
    const measure = () => {
      const element = activeId ? rows.current.get(activeId) : null;
      if (!element) {
        setBox(null);
        return;
      }

      const next: HighlightBox = { top: element.offsetTop, height: element.offsetHeight };
      setBox((current) =>
        current && current.top === next.top && current.height === next.height ? current : next
      );
    };

    measure();

    // Re-measured whenever the container resizes, which is precisely when rows
    // move: a panel expanding or collapsing changes the container's height on
    // every frame of its animation, so the wash tracks it rather than arriving
    // late.
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeId, rowsKey, container, rows]);

  useEffect(() => {
    if (!box) {
      visible.current = false;
      return;
    }

    if (visible.current) {
      top.set(box.top);
      height.set(box.height);
      return;
    }

    top.jump(box.top);
    height.jump(box.height);
    visible.current = true;
  }, [box, top, height]);

  return (
    <motion.div
      aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, top, height }}
      initial={false}
      animate={{ opacity: box ? 1 : 0 }}
      transition={EASE_QUICK}
      className="pointer-events-none bg-[#F8F8F8]"
    />
  );
}
