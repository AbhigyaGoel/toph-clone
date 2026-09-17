'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { MapSurface } from '@/components/dashboard/MapSurface';
import { Icon } from '@/components/ui/Icon';
import { useScrollLock } from '@/components/ui/useScrollLock';
import { EASE_QUICK, SPRING_PANEL, SPRING_SOFT } from '@/lib/motion';
import type { MapLocation } from '@/lib/types';

interface FieldMapProps {
  readonly location: MapLocation;
  /** Named on the dialog so the expanded view says which field it is showing. */
  readonly fieldLabel: string;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Breathing room around the expanded map, and space above it for the header. */
const EDGE = 24;
const HEADER = 72;

const expandedRect = (): Rect => ({
  x: EDGE,
  y: HEADER,
  width: Math.max(0, window.innerWidth - EDGE * 2),
  height: Math.max(0, window.innerHeight - HEADER - EDGE),
});

/**
 * Figma `Frame 187` — the satellite view, and its expanded dialog.
 *
 * The dialog is rendered through a portal to `document.body`, which is not
 * decoration: this component is mounted inside the expanded detail panel, and
 * that panel is `position: sticky`. Sticky *always* establishes a stacking
 * context, so a dialog rendered in place has its `z-index` resolved inside that
 * context no matter how high it is set — the table's `sticky top-0 z-10`
 * heading then paints straight through the map. The panel's scroll container
 * also sets `container-type: inline-size`, which makes it the containing block
 * for `position: fixed` descendants, so a "full screen" overlay would not be
 * full screen either. A portal escapes both.
 *
 * It grows from wherever the inline tile is sitting: the tile's viewport rect
 * is measured on open and the dialog animates from that box to the expanded
 * one, so the plot you were looking at travels rather than the page cutting to
 * a second, larger map. Explicit geometry rather than a shared `layoutId`,
 * because a layout animation between a sticky, size-contained subtree and a
 * portal at the document root is exactly the case that projection gets wrong.
 */
export function FieldMap({ location, fieldLabel }: FieldMapProps) {
  const tile = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<Rect | null>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  /** Portals need the DOM, so nothing renders through one until after mount. */
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const measureOrigin = useCallback((): Rect | null => {
    const box = tile.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }, []);

  const close = useCallback(() => {
    // Re-measure on the way out: the page may have scrolled underneath, and
    // collapsing to where the tile *was* would fly off to the wrong place.
    setOrigin(measureOrigin());
    setOpen(false);
    opener.current?.focus();
  }, [measureOrigin]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onResize = () => setTarget(expandedRect());

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  // The dialog covers the page; stop the table scrolling behind it. Shared and
  // reference-counted so overlapping overlays cannot strand the lock.
  useScrollLock(open);

  const expand = () => {
    const box = measureOrigin();
    if (!box) return;
    setOrigin(box);
    setTarget(expandedRect());
    setOpen(true);
  };

  const dialog =
    open && origin && target ? (
      <motion.div
        role="dialog"
        aria-modal
        aria-label={`${fieldLabel} — expanded map`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={EASE_QUICK}
        onClick={close}
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
      >
        <div className="flex h-[72px] items-center justify-between px-[24px]">
          <span className="text-[16px] font-normal leading-[1.3] text-white">{fieldLabel}</span>
          <motion.button
            type="button"
            autoFocus
            onClick={close}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={SPRING_SOFT}
            className="flex items-center gap-[8px] rounded-[80px] bg-white px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip"
          >
            <Icon name="x" />
            Close
          </motion.button>
        </div>

        <motion.div
          // Animating the box rather than a transform keeps the plot and pin,
          // which are percentages of the frame, correct at every intermediate
          // size; a scale transform would stretch the pin with the map.
          initial={{ left: origin.x, top: origin.y, width: origin.width, height: origin.height }}
          animate={{ left: target.x, top: target.y, width: target.width, height: target.height }}
          exit={{ left: origin.x, top: origin.y, width: origin.width, height: origin.height }}
          transition={SPRING_PANEL}
          onClick={(event) => event.stopPropagation()}
          className="absolute"
        >
          <MapSurface location={location} className="h-full w-full" />
        </motion.div>
      </motion.div>
    ) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-[20px] self-stretch">
      {/*
        The inline tile stays mounted while the dialog is open. Swapping it for
        a placeholder would leave two copies of the same surface alive during
        the close transition and flash one of them.
      */}
      <MapSurface ref={tile} location={location} className="min-h-[335px] flex-1 xl:min-h-0" />

      <motion.button
        ref={opener}
        type="button"
        onClick={expand}
        aria-haspopup="dialog"
        aria-expanded={open}
        whileHover={{ y: -1, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={SPRING_SOFT}
        className="flex items-center justify-center gap-[10px] self-stretch rounded-[7.04px] bg-white px-[8.8px] py-[10.56px] text-[16px] font-normal leading-[1.3] text-black shadow-detail-button outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2"
      >
        <Icon name="expand" />
        Expand Map
      </motion.button>

      {mounted ? createPortal(<AnimatePresence>{dialog}</AnimatePresence>, document.body) : null}
    </div>
  );
}
