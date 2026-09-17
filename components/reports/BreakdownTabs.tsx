'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import { BarList } from '@/components/charts/BarList';
import { SPRING_SOFT } from '@/lib/motion';
import type { Slice } from '@/lib/reports';

interface BreakdownTabsProps {
  readonly byActivity: readonly Slice[];
  readonly byField: readonly Slice[];
  readonly byWorker: readonly Slice[];
}

type Dimension = 'activity' | 'field' | 'worker';

const TABS: ReadonlyArray<{ key: Dimension; label: string }> = [
  { key: 'activity', label: 'By activity' },
  { key: 'field', label: 'By field' },
  { key: 'worker', label: 'By worker' },
];

/**
 * One breakdown at a time, rather than three side by side.
 *
 * Three identical bar lists in a row look like a lot of information and convey
 * very little: each is squeezed to a third of the width, the labels truncate,
 * and nobody compares across them anyway — you look at one, form a question,
 * then look at another. Swapping the dimension in place keeps the bars full
 * width and puts the comparison where it actually happens, which is in memory
 * between two glances rather than across three columns.
 */
export function BreakdownTabs({ byActivity, byField, byWorker }: BreakdownTabsProps) {
  const [dimension, setDimension] = useState<Dimension>('activity');

  const slices =
    dimension === 'activity' ? byActivity : dimension === 'field' ? byField : byWorker;

  return (
    <section className="flex w-full flex-col self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel">
      <div className="flex flex-col items-start gap-[10px] px-[16px] py-[16px] shadow-divider sm:px-[30px] lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-[16px] font-normal leading-[1.3] text-black">Where the hours went</h2>

        <div className="flex items-center gap-[4px] rounded-[80px] bg-black/[0.04] p-[3px]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setDimension(tab.key)}
              aria-pressed={dimension === tab.key}
              className="relative rounded-[80px] px-[14px] py-[6px] text-[13px] font-normal leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-black/30"
            >
              {dimension === tab.key ? (
                <motion.span
                  layoutId="breakdown-tab"
                  transition={SPRING_SOFT}
                  className="absolute inset-0 rounded-[80px] bg-white shadow-chip-soft"
                />
              ) : null}
              <span
                className={`relative ${dimension === tab.key ? 'text-black' : 'text-[#4D4D4D]'}`}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <BarList
        slices={slices}
        limit={11}
        emptyTitle="No logs in this period"
        emptyBody="Widen the period to see how the crew's time was spent."
      />
    </section>
  );
}
