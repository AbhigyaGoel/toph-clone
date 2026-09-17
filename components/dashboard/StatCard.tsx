'use client';

import { AnimatePresence, motion } from 'framer-motion';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK } from '@/lib/motion';
import type { StatCard as StatCardModel } from '@/lib/types';

interface StatCardProps {
  readonly card: StatCardModel;
  /** Staggers the count-up so the three cards do not all land together. */
  readonly index: number;
}

/**
 * Figma `Frame 120` / `116` / `121` — one summary metric.
 *
 * Deliberately has no hover treatment. A card that lifts under the pointer is
 * promising a click, and these do nothing when clicked — the movement was
 * advertising functionality that is not there. The numbers inside still
 * animate, because those changes are real.
 */
export function StatCard({ card, index }: StatCardProps) {
  return (
    <article className="flex flex-1 flex-col items-start gap-[20px] rounded-[14px] p-[20px] shadow-card">
      <div className="flex items-center justify-center gap-[8px]">
        <Icon name={card.icon} className="text-black" />
        <h2 className="text-[16px] font-normal leading-[1.3] text-black">{card.label}</h2>
      </div>

      {/*
        The metric's text node is trimmed to its cap height in Figma (33.2px)
        rather than sitting in the 62.4px box its 1.3 line height implies. That
        is what makes the card 114px tall instead of 144px, so the leading is
        pinned to the measured value; both children bottom-align on it.
      */}
      <div className="flex items-end justify-center gap-[20px]">
        <span className="text-[48px] font-medium leading-[33.2px] tabular-nums text-black">
          {/*
            Every one of these is derived from the rows, so all three move when
            a log is marked reviewed or a filter changes. Counting up on arrival
            and travelling on change is the same animation doing both jobs.
          */}
          <AnimatedNumber value={card.value} from={0} />
        </span>

        <AnimatePresence mode="popLayout">
          {card.note ? (
            <motion.span
              key={card.note}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.5, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ ...EASE_QUICK, delay: index * 0.04 }}
              className="text-[14px] font-normal leading-[1.3] text-black"
            >
              {card.note}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </article>
  );
}
