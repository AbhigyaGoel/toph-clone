'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import { EmptyState } from '@/components/shell/EmptyState';
import { SPRING_SOFT } from '@/lib/motion';
import type { WeekBucket } from '@/lib/reports';

interface WeeklyColumnsProps {
  readonly weeks: readonly WeekBucket[];
}

/**
 * Hours logged per week.
 *
 * Plain flex columns rather than SVG: the chart has one series, no axes worth
 * drawing and at most sixteen bars, and CSS gives hover, focus and keyboard
 * handling for free where an SVG would need all three rebuilt. A charting
 * library would be ~50kB to render something the browser already lays out.
 *
 * Empty weeks are drawn as empty columns rather than skipped. A gap in the work
 * is information — rain, a broken sprayer, a crew that left — and a chart that
 * closes the gap silently reports a season that did not happen.
 */
export function WeeklyColumns({ weeks }: WeeklyColumnsProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (weeks.length === 0) {
    return (
      <EmptyState
        icon="chart-line"
        title="Nothing to chart yet"
        body="Once there are logs in this period, the hours behind them are bucketed by week here."
      />
    );
  }

  const peak = Math.max(...weeks.map((week) => week.hours), 1);
  const active = weeks.find((week) => week.start === hovered) ?? null;

  return (
    <div className="flex flex-col gap-[10px] px-[30px] py-[20px]">
      <div className="flex h-[24px] items-baseline gap-[8px]">
        {active ? (
          <>
            <span className="text-[16px] font-medium leading-[1.3] tabular-nums text-black">
              {active.hours}h
            </span>
            <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
              week of {active.label} · {active.logs} {active.logs === 1 ? 'log' : 'logs'}
            </span>
          </>
        ) : (
          <span className="text-[13px] font-normal leading-[1.3] text-[#B3B3B3]">
            Hover a week for its total
          </span>
        )}
      </div>

      {/*
        Capped and centred, because the bucket count is not fixed. A period
        holding seven weeks stretched each column to ~175px, which stops reading
        as a column chart and starts reading as a row of slabs. The cap keeps a
        sparse period looking like the same chart as a dense one.
      */}
      <div
        className="mx-auto flex h-[160px] w-full max-w-[1100px] items-end justify-center gap-[6px]"
        onMouseLeave={() => setHovered(null)}
      >
        {/*
          Not a `<button>`. These were buttons for the hover and focus alone —
          so every column took a pointer cursor and a click that did nothing,
          which is a promise the chart cannot keep: there is no per-week view to
          go to, and inventing a date-range filter for one chart would be a
          bigger lie than the cursor. They stay reachable and labelled, so a
          keyboard reader still gets each week's total; they just no longer
          claim to be actions.
        */}
        {weeks.map((week, index) => (
          <div
            key={week.start}
            tabIndex={0}
            role="img"
            onMouseEnter={() => setHovered(week.start)}
            onFocus={() => setHovered(week.start)}
            aria-label={`Week of ${week.label}: ${week.hours} hours across ${week.logs} logs`}
            className="group flex h-full max-w-[56px] flex-1 cursor-default flex-col justify-end outline-none"
          >
            <motion.span
              initial={{ scaleY: 0 }}
              animate={{ scaleY: Math.max(week.hours / peak, week.hours === 0 ? 0 : 0.02) }}
              transition={{ ...SPRING_SOFT, delay: index * 0.02 }}
              style={{ transformOrigin: 'bottom', height: '100%' }}
              className={`w-full rounded-[4px] transition-colors ${
                hovered === week.start ? 'bg-[#146C44]' : 'bg-[rgba(20,108,68,0.45)]'
              } group-focus-visible:bg-[#146C44]`}
            />
            {/*
              A zero week still needs a target to hover, so the column keeps a
              hairline of its own rather than collapsing to nothing.
            */}
            {week.hours === 0 ? (
              <span className="h-[2px] w-full rounded-[80px] bg-black/[0.08]" />
            ) : null}
          </div>
        ))}
      </div>

      {/* Mirrors the bars' own constraints exactly, or the labels drift off them. */}
      <div className="mx-auto flex w-full max-w-[1100px] justify-center gap-[6px]">
        {weeks.map((week, index) => (
          <span
            key={week.start}
            className="max-w-[56px] flex-1 overflow-hidden whitespace-nowrap text-center text-[10px] font-normal leading-[1.3] text-[#B3B3B3]"
          >
            {/* Every other label at this density, or they collide. */}
            {index % 2 === 0 ? week.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
