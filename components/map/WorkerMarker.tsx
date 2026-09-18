'use client';

import { motion } from 'framer-motion';

import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

/**
 * Out there now, last known position, or somewhere they should not be.
 *
 * The three states Find My draws, and for the same reasons. A device that is
 * online gets a live marker; one that is not gets the last place it was, dimmed
 * and timestamped, because "I do not know" is less useful than "here, an hour
 * ago". The third state is ours: somebody standing on a block that is closed.
 */
export type WorkerState = 'working' | 'last-seen' | 'flagged';

interface WorkerMarkerProps {
  readonly shortName: string;
  /** Position as CSS percentages within the map frame. */
  readonly left: string;
  readonly top: string;
  readonly state: WorkerState;
  /** Second line on the capsule: an activity, or when they were last seen. */
  readonly caption?: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly onSelect: () => void;
  /**
   * Whether the position changes while mounted.
   *
   * The replay moves its markers as the clock runs and wants the travel eased;
   * the live map places them once. Animating a static marker's coordinates only
   * buys a slide from the top-left corner on first paint.
   */
  readonly animatePosition?: boolean;
}

const LOOK: Record<WorkerState, { readonly fill: string; readonly capsule: string }> = {
  working: { fill: '#0065F0', capsule: 'rgba(0,0,0,0.7)' },
  flagged: { fill: '#B00020', capsule: 'rgba(176,0,32,0.92)' },
  // Grey and no halo. A stale position that looks live is worse than no marker
  // at all — it is the one thing on this screen somebody might act on.
  'last-seen': { fill: '#6B6B6B', capsule: 'rgba(0,0,0,0.55)' },
};

/**
 * One person on the farm map.
 *
 * Shared by the live map and the replay so the two cannot drift: a worker looks
 * the same, sits at the same offset and opens the same way on both, and the
 * Find My vocabulary is written down once.
 */
export function WorkerMarker({
  shortName,
  left,
  top,
  state,
  caption,
  title,
  ariaLabel,
  onSelect,
  animatePosition = false,
}: WorkerMarkerProps) {
  const look = LOOK[state];
  const live = state !== 'last-seen';

  return (
    <motion.button
      type="button"
      // `x`/`y` rather than Tailwind's `-translate-*` classes.
      //
      // Framer writes the whole `transform` inline to animate `scale`, which
      // silently wipes any transform coming from a class — so the marker
      // anchored by its top-left corner instead of its point, sitting half its
      // own size down and to the right of the spot it was reporting. Composing
      // the centring into the same motion values is the only way the two can
      // coexist.
      initial={{ opacity: 0, scale: 0.4, x: '-50%', y: '-50%' }}
      animate={{
        opacity: 1,
        scale: 1,
        x: '-50%',
        y: '-50%',
        ...(animatePosition ? { left, top } : {}),
      }}
      exit={{ opacity: 0, scale: 0.4, x: '-50%', y: '-50%' }}
      // Position eases linearly, the entrance springs. A spring on the
      // coordinates overshoots at every row end and reads as stumbling.
      transition={{
        left: { duration: 0.35, ease: 'linear' },
        top: { duration: 0.35, ease: 'linear' },
        opacity: EASE_QUICK,
        scale: SPRING_SOFT,
      }}
      style={animatePosition ? undefined : { left, top }}
      onClick={onSelect}
      title={title}
      aria-label={ariaLabel}
      className="absolute z-10 flex flex-col items-center gap-[3px] outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <span className="relative flex items-center justify-center">
        {live ? (
          <motion.span
            aria-hidden
            animate={{ opacity: [0.45, 0.12, 0.45], scale: [1, 1.75, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute h-[18px] w-[18px] rounded-full"
            style={{ backgroundColor: look.fill }}
          />
        ) : null}

        <span
          className="relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-[2px] border-white text-[8px] font-semibold leading-none text-white"
          style={{
            backgroundColor: look.fill,
            boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
            opacity: live ? 1 : 0.85,
          }}
        >
          {state === 'flagged' ? <Icon name="x" size={8} /> : shortName.slice(0, 1)}
        </span>
      </span>

      <span
        className="flex flex-col items-center whitespace-nowrap rounded-[80px] px-[6px] py-[1px] text-[9px] font-medium leading-[1.25] text-white"
        style={{ backgroundColor: look.capsule, boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
      >
        {shortName}
        {caption ? <span className="text-[8px] font-normal opacity-75">{caption}</span> : null}
      </span>
    </motion.button>
  );
}
