'use client';

import { motion } from 'framer-motion';
import type { MouseEvent } from 'react';

import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

export type CheckboxState = 'unchecked' | 'checked' | 'indeterminate';

interface CheckboxProps {
  readonly state: CheckboxState;
  /** Receives the click so the table can read shift for range selection. */
  readonly onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Announced to assistive tech; the control itself is a 16px glyph. */
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * The table's row selector.
 *
 * The design draws this as Lucide's `square` at 20% opacity and never shows a
 * checked state, so the checked treatment borrows the toolbar's: an applied
 * filter chip inverts to a black fill, and so does a ticked box. The tick is
 * drawn rather than swapped in — `pathLength` animates the stroke on, which is
 * what makes ticking eleven rows in a row read as eleven separate acts instead
 * of a column of glyphs blinking.
 */
export function Checkbox({ state, onToggle, label, disabled = false }: CheckboxProps) {
  const checked = state === 'checked';
  const marked = checked || state === 'indeterminate';

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={state === 'indeterminate' ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      whileHover={disabled ? undefined : { scale: 1.15 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={SPRING_SOFT}
      className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
    >
      <motion.svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        initial={false}
        animate={{ opacity: disabled ? 0.2 : marked ? 1 : 0.35 }}
        transition={EASE_QUICK}
      >
        <motion.rect
          x={3}
          y={3}
          width={18}
          height={18}
          rx={4}
          strokeWidth={2}
          initial={false}
          animate={{
            fill: marked ? '#000000' : 'rgba(0,0,0,0)',
            stroke: marked ? '#000000' : '#4D4D4D',
          }}
          transition={EASE_QUICK}
        />

        {/* Full tick for a checked row, a bar for a partly-selected table. */}
        <motion.path
          d={state === 'indeterminate' ? 'M8 12h8' : 'M7.5 12.5l3 3 6-6.5'}
          stroke="#FFFFFF"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: marked ? 1 : 0, opacity: marked ? 1 : 0 }}
          transition={{ ...SPRING_SOFT, opacity: { duration: 0.1 } }}
        />
      </motion.svg>
    </motion.button>
  );
}
