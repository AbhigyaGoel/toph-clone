'use client';

import { motion } from 'framer-motion';

import { EmptyState } from '@/components/shell/EmptyState';
import { SPRING_SOFT } from '@/lib/motion';
import type { Slice } from '@/lib/reports';

interface BarListProps {
  readonly slices: readonly Slice[];
  /** How many rows to draw before folding the rest into "other". */
  readonly limit?: number;
  readonly emptyTitle: string;
  readonly emptyBody: string;
}

/**
 * A ranked breakdown: label, bar, number.
 *
 * Chosen over a pie chart deliberately. Every question on this screen is
 * comparative — is spraying eating more hours than harvesting — and people read
 * length far more accurately than angle or area. A bar list also survives having
 * eleven categories, which a pie does not, and it degrades to a plain readable
 * list when the numbers are all similar.
 *
 * Bars are sized against the largest value rather than the total, so the top row
 * always fills the track. Comparing rows to each other is the job; comparing
 * them to a total nobody can see is not.
 */
/** A tail this short is drawn in full rather than folded into "Other". */
const FOLD_ABOVE = 2;

export function BarList({ slices, limit = 8, emptyTitle, emptyBody }: BarListProps) {
  if (slices.length === 0) {
    return <EmptyState icon="chart-pie" title={emptyTitle} body={emptyBody} />;
  }

  /*
   * Folding the tail into one row only earns its place when the tail is long.
   *
   * At two leftovers it cost the reader both names and gave back one row — and
   * a bar labelled "2 more" carrying real hours reads as a number from nowhere,
   * which is exactly how it was reported. Below the threshold the rows are just
   * drawn; above it they fold, and the fold says what is in it.
   */
  const tail = slices.slice(limit);
  const folds = tail.length > FOLD_ABOVE;
  const shown = folds ? slices.slice(0, limit) : slices;
  const other = folds
    ? {
        label: `Other — ${tail.length} smaller categories`,
        names: tail.map((slice) => slice.label).join(', '),
        hours: Math.round(tail.reduce((sum, slice) => sum + slice.hours, 0) * 10) / 10,
        logs: tail.reduce((sum, slice) => sum + slice.logs, 0),
      }
    : null;

  const rows = other ? [...shown, other] : shown;
  const peak = Math.max(...rows.map((row) => row.hours), 1);

  return (
    <div className="flex flex-col gap-[12px] px-[30px] py-[20px]">
      {rows.map((row, index) => (
        <div key={row.label} className="flex flex-col gap-[5px]">
          <div className="flex items-baseline justify-between gap-[10px]">
            <span
              title={other && row === other ? other.names : undefined}
              className="truncate text-[13px] font-normal leading-[1.3] text-black"
            >
              {row.label}
            </span>
            <span className="shrink-0 text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
              {row.hours}h
              <span className="pl-[8px] text-[#B3B3B3]">
                {row.logs} {row.logs === 1 ? 'log' : 'logs'}
              </span>
            </span>
          </div>

          <div className="h-[8px] w-full overflow-hidden rounded-[80px] bg-black/[0.05]">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: row.hours / peak }}
              transition={{ ...SPRING_SOFT, delay: index * 0.03 }}
              style={{ transformOrigin: 'left' }}
              className={`h-full w-full rounded-[80px] ${
                other && row === other ? 'bg-black/20' : 'bg-[#146C44]'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
