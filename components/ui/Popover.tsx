'use client';

import { AnimatePresence, motion, useSpring } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { menuVariants, SPRING_FOLLOW } from '@/lib/motion';

interface PopoverProps {
  readonly open: boolean;
  /** The control the panel hangs from. */
  readonly anchor: RefObject<HTMLElement>;
  /** Which edge to line the panel up with. */
  readonly align?: 'start' | 'end';
  /** Makes the panel exactly as wide as its control, for full-width triggers. */
  readonly matchWidth?: boolean;
  readonly id?: string;
  readonly role?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Space between the control and its panel, and from the viewport edge. */
const OFFSET = 6;
const EDGE = 12;
const MIN_HEIGHT = 120;

interface Placement {
  readonly maxHeight: number;
  readonly width: number | null;
}

const SAME = (a: Placement, b: Placement): boolean =>
  a.maxHeight === b.maxHeight && a.width === b.width;

/**
 * A panel anchored to a control, rendered at the document root.
 *
 * The portal is the first half of the job. These menus open from the log
 * panel's toolbar, and that panel is a `<section>` with `overflow-hidden` —
 * needed for its rounded corners — so a dropdown declared in place is simply
 * clipped at the panel's edge, which is why the Filter menu lost its lower half
 * as soon as it had more than a few rows. The scroll container below it adds
 * `overflow-x-auto` and `container-type: inline-size`, which clip and re-anchor
 * fixed positioning respectively. Rendering at `document.body` escapes all
 * three.
 *
 * The second half is staying attached. The control this hangs from is a chip in
 * a wrapping, right-aligned row, so picking a value from the menu moves the chip
 * that opened it — applying one filter shifted the Filter chip 137px to the left
 * while the menu stayed exactly where it was, and from there the next click was
 * as likely to land outside the menu as in it. So the anchor is re-measured on
 * an animation frame while the panel is open, not just on scroll and resize:
 * nothing fires an event when a sibling's layout animation pushes your control
 * sideways. The panel follows on a spring, so it travels with the chip instead
 * of teleporting after it.
 *
 * Height is capped to what is left on screen, so a long list scrolls inside the
 * panel rather than running off the bottom.
 */
export function Popover({
  open,
  anchor,
  align = 'end',
  matchWidth = false,
  id,
  role,
  className = '',
  children,
}: PopoverProps) {
  const [mounted, setMounted] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ maxHeight: MIN_HEIGHT, width: null });

  const panel = useRef<HTMLDivElement>(null);
  /** False until the first measurement, which is applied without animating. */
  const settled = useRef(false);
  /** The last position written, so an unmoved frame writes nothing. */
  const lastPosition = useRef({ x: 0, y: 0 });

  const x = useSpring(0, SPRING_FOLLOW);
  const y = useSpring(0, SPRING_FOLLOW);

  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const control = anchor.current;
    const rect = control?.getBoundingClientRect();
    if (!rect) return;

    const panelWidth = panel.current?.offsetWidth ?? rect.width;
    const wanted = align === 'end' ? rect.right - panelWidth : rect.left;
    const furthest = Math.max(EDGE, window.innerWidth - panelWidth - EDGE);

    const nextX = Math.min(Math.max(EDGE, wanted), furthest);
    const nextY = rect.bottom + OFFSET;

    if (settled.current) {
      // Only on a real move. The loop runs every frame the panel is open, and
      // most of those frames the anchor has not shifted at all; writing anyway
      // would keep both springs awake for nothing.
      if (nextX !== lastPosition.current.x) x.set(nextX);
      if (nextY !== lastPosition.current.y) y.set(nextY);
      lastPosition.current = { x: nextX, y: nextY };
    } else {
      // The opening frame must not be animated from wherever the springs last
      // rested, or every menu would fly in from the previous one's position.
      x.jump(nextX);
      y.jump(nextY);
      lastPosition.current = { x: nextX, y: nextY };
      settled.current = true;
      setPlaced(true);
    }

    setPlacement((current) => {
      const next: Placement = {
        maxHeight: Math.max(MIN_HEIGHT, window.innerHeight - nextY - EDGE),
        width: matchWidth ? rect.width : null,
      };
      return SAME(current, next) ? current : next;
    });
  }, [align, anchor, matchWidth, x, y]);

  useEffect(() => {
    if (!open) {
      settled.current = false;
      setPlaced(false);
      return undefined;
    }

    measure();

    // An animation frame loop rather than events: the anchor moves when its
    // neighbours reflow, and layout changes raise no event of their own.
    // `measure` writes through motion values and only sets state when the
    // result actually changes, so a frame where nothing moved costs one rect
    // read and no render.
    let frame = requestAnimationFrame(function tick() {
      measure();
      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [open, measure]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          style={{ position: 'fixed', top: 0, left: 0, x, y, zIndex: 120 }}
          // Hidden for the single frame between mounting and the first
          // measurement, so the panel is never painted at the origin. `!open`
          // keeps it visible on the way out, or this would blank the panel
          // before its exit animation had a chance to run.
          animate={{ opacity: placed || !open ? 1 : 0 }}
          transition={{ duration: 0 }}
        >
          <motion.div
            ref={panel}
            id={id}
            role={role}
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              maxHeight: placement.maxHeight,
              ...(placement.width === null ? {} : { width: placement.width }),
              transformOrigin: align === 'end' ? 'top right' : 'top left',
            }}
            className={`overflow-y-auto overscroll-contain rounded-[14px] bg-white p-[6px] shadow-chip ${className}`}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
