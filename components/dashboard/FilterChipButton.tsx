'use client';

import { motion } from 'framer-motion';

import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { FilterChip } from '@/lib/types';

interface FilterChipButtonProps {
  readonly chip: FilterChip;
  readonly onClick?: () => void;
  /** Set when the chip opens a menu. */
  readonly expanded?: boolean;
  readonly controls?: string;
  /** Rendered inside the chip after the label — the range chip's live count. */
  readonly trailing?: React.ReactNode;
}

/**
 * Figma `Frame 179` / `180` / `181` / `177` in the log panel toolbar.
 *
 * An applied filter inverts to a black fill and swaps its leading glyph for an
 * x, which reads as "click to clear"; an unapplied one stays white.
 *
 * `layout` on the chip is what makes the toolbar fluid: when a chip is added or
 * removed, or the count inside one changes width, every other chip slides to
 * its new position instead of jumping. The fill and text colours are animated
 * values rather than swapped classes so applying a filter is a transition
 * through grey, not a hard cut to black.
 */
export function FilterChipButton({
  chip,
  onClick,
  expanded,
  controls,
  trailing,
}: FilterChipButtonProps) {
  return (
    <motion.button
      type="button"
      layout
      onClick={onClick}
      aria-pressed={expanded === undefined ? chip.selected : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      initial={false}
      animate={{
        backgroundColor: chip.selected ? '#000000' : '#FFFFFF',
        color: chip.selected ? '#FFFFFF' : '#4D4D4D',
      }}
      whileHover={{ y: -1, scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ ...SPRING_SOFT, backgroundColor: EASE_QUICK, color: EASE_QUICK }}
      className="group flex shrink-0 items-center justify-center gap-[10px] whitespace-nowrap rounded-[80px] px-[16px] py-[8px] shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2"
    >
      {/*
        An applied chip's leading glyph is an x meaning "clear this". Turning it
        under the pointer is the confirmation that the whole chip is the remove
        control, not just the glyph. Plain CSS because it is pure hover state
        with nothing to interpolate against the chip's own animated fill.
      */}
      <span
        className={`flex items-center transition-transform duration-200 ${
          chip.icon === 'x' ? 'group-hover:rotate-90' : ''
        }`}
      >
        <Icon name={chip.icon} />
      </span>

      <span className="flex items-center gap-[4px] text-[14px] font-normal leading-[1.3]">
        {chip.label}
        {trailing}
      </span>
    </motion.button>
  );
}
