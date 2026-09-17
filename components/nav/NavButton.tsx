'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { EASE_QUICK, LAYOUT_ID, SPRING_SNAP, SPRING_SOFT } from '@/lib/motion';
import type { NavItem } from '@/lib/types';

const MotionLink = motion.create(Link);

interface NavButtonProps {
  readonly item: NavItem;
  /** True on the one item carrying the rail's travelling wash. */
  readonly highlighted: boolean;
  /** True on the item whose route is open. Reads even when the wash is away. */
  readonly active: boolean;
  /**
   * Claims the highlight. Deliberately has no "release" counterpart — see the
   * note on the handlers below.
   */
  readonly onHover: (id: string) => void;
  /** Called on a link click, before the route has begun to load. */
  readonly onNavigate?: (id: string) => void;
  /** For items with no `href`: what pressing them does. */
  readonly onSelect?: () => void;
}

const SHELL =
  'relative flex items-center justify-between gap-[14px] self-stretch rounded-[4px] px-[14px] py-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-black/30';

/**
 * Figma `Button` inside the navigation rail.
 *
 * The active variant swaps to a 5% black fill and spreads its contents so the
 * count pill can sit flush right; the resting variant is a simple icon + label.
 *
 * That 5% fill is the same travelling element as the table's row wash: it rests
 * on the open route, follows the pointer down the rail, and returns when the
 * pointer leaves. One `layoutId` rather than a fill per button, so it slides.
 *
 * Because the wash travels, it cannot also be what tells you where you are — it
 * spends most of its time under the pointer instead. The open route is marked a
 * second way, in weight and ink, which stays put while the wash is away.
 *
 * An item with an `href` is a real link: middle-click opens a tab, the browser
 * shows the target, and prefetch warms the route. The two footer items have no
 * destination — they act on the session — so they stay buttons.
 */
export function NavButton({
  item,
  highlighted,
  active,
  onHover,
  onNavigate,
  onSelect,
}: NavButtonProps) {
  const body = (
    <>
      {highlighted ? (
        <motion.span
          layoutId={LAYOUT_ID.navHighlight}
          transition={SPRING_SNAP}
          className="pointer-events-none absolute inset-0 rounded-[4px] bg-black/5"
        />
      ) : null}

      <span className="relative flex items-center gap-[14px]">
        <motion.span
          initial={false}
          animate={{
            x: highlighted ? 1 : 0,
            color: highlighted || active ? '#1A1A1A' : '#4D4D4D',
          }}
          transition={EASE_QUICK}
          className="flex items-center"
        >
          <Icon name={item.icon} />
        </motion.span>
        <span
          className={`text-[14px] leading-[1.3] text-black ${active ? 'font-medium' : 'font-normal'}`}
        >
          {item.label}
        </span>
      </span>

      <AnimatePresence initial={false}>
        {item.badge ? <NavBadge key="badge" value={item.badge} /> : null}
      </AnimatePresence>
    </>
  );

  /*
    Only claims the highlight; never releases it. `mouseleave` on this element
    fires *before* `mouseenter` on the next one, so releasing here sent the
    highlight back to the resting item between every pair of neighbours — a
    visible round trip to Dashboard on the way from one section to another. The
    rail clears it once, on leaving the rail.
  */
  const shared = {
    onHoverStart: () => onHover(item.id),
    onFocus: () => onHover(item.id),
    whileTap: { scale: 0.98 },
    transition: SPRING_SOFT,
    className: SHELL,
    children: body,
  };

  if (item.href) {
    return (
      <MotionLink
        href={item.href}
        prefetch
        aria-current={active ? 'page' : undefined}
        // Fires before the router has done anything, which is the point: the
        // rail marks where you are going while the screen is still on its way.
        onClick={() => onNavigate?.(item.id)}
        {...shared}
      />
    );
  }

  return <motion.button type="button" onClick={onSelect} {...shared} />;
}

interface NavBadgeProps {
  readonly value: string;
}

/** Figma `Frame 158` — the fixed 20x14 green count pill. */
function NavBadge({ value }: NavBadgeProps): ReactNode {
  const numeric = Number(value);

  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={SPRING_SOFT}
      className="relative flex h-[14px] w-[20px] shrink-0 flex-col items-center justify-center gap-[10px] rounded-[50px] bg-[rgba(1,156,37,0.5)] p-[4px] shadow-badge"
    >
      <span className="text-center text-[10px] font-medium leading-[1.3] text-white">
        {/*
          The badge is the count of unreviewed logs, so marking rows reviewed
          moves it. Rolling rather than cutting is what ties the bulk action at
          the bottom of the page to the number at the top of the rail.
        */}
        {Number.isFinite(numeric) ? <AnimatedNumber value={numeric} /> : value}
      </span>
    </motion.span>
  );
}
