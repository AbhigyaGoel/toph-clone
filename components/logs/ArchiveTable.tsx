'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';

import { useLogQueryNavigation } from '@/components/dashboard/useLogQueryNavigation';
import { LogBrief } from '@/components/logs/LogBrief';
import { EmptyState } from '@/components/shell/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { formatLogDate, formatTimeRange } from '@/lib/format';
import { toggleOpenLog } from '@/lib/logQuery';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { ActivityLog, LogDetail, Product, ReferenceData } from '@/lib/types';

/** What the archive knows about one row's compliance obligation. */
export interface ArchiveRecordState {
  readonly requiresProduct: boolean;
  readonly applicationCount: number;
}

interface ArchiveTableProps {
  readonly logs: readonly ActivityLog[];
  readonly records: Readonly<Record<string, ArchiveRecordState>>;
  /** Dims the rows while a filter change is in flight. */
  readonly pending: boolean;
  /** Detail for the rows the URL asks to be open. */
  readonly details: readonly LogDetail[];
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
}

const ROW = 'grid min-w-[880px] grid-cols-[132px_1fr_1fr_120px_96px_132px_92px] items-center';

/** Shift length, e.g. "4h 40m", from the two instants the row already carries. */
function duration(startedAt: string, endedAt: string): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000)
  );
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * Every log the farm has, grouped by the day it happened.
 *
 * Deliberately not the dashboard's table. That one is a review queue — it opens
 * rows in place because the job there is to work through them one at a time.
 * This is an archive: the job is to find something, or to see a season's shape,
 * so the rows are denser and carry the two columns review does not need — how
 * long the shift was, and whether the log produced the compliance record it
 * owes.
 *
 * Rows open *here*. They used to link to the dashboard, on the reasoning that
 * two expanded panels would be two places to fix when one changed — true, and
 * solving the wrong problem. The cost was that finding a log and then being
 * thrown to another screen to read it made the search pointless: you landed on
 * a table and had to find the same row a second time. The panel is shared
 * (`LogBrief`), so there is still one implementation.
 *
 * The day headings are sticky, so scrolling a long season never leaves you
 * looking at a row without knowing when it happened.
 */
export function ArchiveTable({
  logs,
  records,
  pending,
  details,
  products,
  reference,
  canWrite,
  canRetract,
}: ArchiveTableProps) {
  const days = useMemo(() => groupByDay(logs), [logs]);
  const { query, replace } = useLogQueryNavigation();
  const detailFor = useMemo(
    () => new Map(details.map((detail) => [detail.logId, detail])),
    [details]
  );

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="audio-lines"
        title="No logs match this view"
        body="Nothing your crew recorded falls inside the current search, date range and filters. Widen the range or clear a filter to see more."
      />
    );
  }

  return (
    <motion.div
      animate={{ opacity: pending ? 0.45 : 1 }}
      transition={EASE_QUICK}
      className="flex w-full flex-col overflow-x-auto"
    >
      <div className={`${ROW} sticky top-0 z-10 bg-white px-[30px] py-[12px] shadow-divider`}>
        {['TIME', 'EMPLOYEE', 'ACTIVITY', 'FIELD', 'LENGTH', 'RECORD', ''].map((label, index) => (
          <span
            key={index}
            className="text-[10px] font-medium uppercase leading-[1.3] tracking-[0.04em] text-[#B3B3B3]"
          >
            {label}
          </span>
        ))}
      </div>

      {days.map((day) => (
        <div key={day.key} className="flex flex-col">
          <div className="sticky top-[41px] z-[9] flex min-w-[880px] items-baseline gap-[10px] bg-[#FAFAFA] px-[30px] py-[8px]">
            <span className="text-[12px] font-medium leading-[1.3] text-black">{day.label}</span>
            <span className="text-[12px] font-normal leading-[1.3] text-[#4D4D4D]">
              {day.logs.length} {day.logs.length === 1 ? 'log' : 'logs'}
            </span>
          </div>

          {day.logs.map((log) => (
            <ArchiveRow
              key={log.id}
              log={log}
              state={records[log.id]}
              expanded={query.open.includes(log.id)}
              detail={detailFor.get(log.id) ?? null}
              products={products}
              reference={reference}
              canWrite={canWrite}
              canRetract={canRetract}
              onToggle={() => replace(toggleOpenLog(query, log.id))}
            />
          ))}
        </div>
      ))}
    </motion.div>
  );
}

interface ArchiveRowProps {
  readonly log: ActivityLog;
  readonly state: ArchiveRecordState | undefined;
  readonly expanded: boolean;
  readonly detail: LogDetail | null;
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
  readonly onToggle: () => void;
}

function ArchiveRow({
  log,
  state,
  expanded,
  detail,
  products,
  reference,
  canWrite,
  canRetract,
  onToggle,
}: ArchiveRowProps) {
  return (
    <div className="flex min-w-[880px] flex-col">
      <div className={`${ROW} group px-[30px] shadow-divider transition-colors hover:bg-[#F8F8F8]`}>
      <span className="py-[14px] text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
        {formatTimeRange(log.startedAt, log.endedAt)}
      </span>

      <span className="flex items-center gap-[8px] py-[14px] pr-[10px] text-[14px] font-normal leading-[1.3] text-black">
        {log.employee}
        {log.status === 'new' ? (
          <span
            title="Not yet reviewed"
            className="h-[6px] w-[6px] shrink-0 rounded-full bg-[rgba(1,156,37,0.5)]"
          />
        ) : null}
      </span>

      <span className="py-[14px] pr-[10px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">
        {log.activity}
      </span>

      <span className="py-[14px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">
        {log.field}
      </span>

      <span className="py-[14px] text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
        {duration(log.startedAt, log.endedAt)}
      </span>

      <span className="py-[14px]">
        <RecordChip state={state} />
      </span>

      <span className="flex justify-end py-[14px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Close' : 'Open'} ${log.employee} — ${log.activity} on ${log.field}`}
          className={`flex items-center gap-[6px] rounded-[80px] px-[10px] py-[5px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-black/30 group-hover:opacity-100 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {expanded ? 'Close' : 'Open'}
          <motion.span
            aria-hidden
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={SPRING_SOFT}
            className="flex"
          >
            <Icon name="chevron-down" size={12} />
          </motion.span>
        </button>
      </span>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE_QUICK}
            className="overflow-hidden"
          >
            {detail ? (
              <LogBrief
                detail={detail}
                employeeLabel={log.employee}
                fieldLabel={log.field}
                products={products}
                reference={reference}
                recordContext={`${log.activity} on ${log.field}, ${formatLogDate(log.startedAt)}, logged by ${log.employee}.`}
                canWrite={canWrite}
                canRetract={canRetract}
              />
            ) : (
              <div className="border-t border-black/[0.06] bg-black/[0.015] px-[30px] py-[20px]">
                <span className="text-[13px] font-normal leading-[1.4] text-[#B3B3B3]">
                  Opening…
                </span>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface RecordChipProps {
  readonly state: ArchiveRecordState | undefined;
}

/**
 * Whether this log produced the compliance record it owes.
 *
 * Three states, and the third is the important one: a log that owes nothing is
 * not the same as a log that owes a record and has one, and neither is the same
 * as a gap. Showing a tick on a harvest would make the tick meaningless.
 */
function RecordChip({ state }: RecordChipProps) {
  if (!state || !state.requiresProduct) {
    return <span className="text-[13px] font-normal leading-[1.3] text-[#B3B3B3]">—</span>;
  }

  if (state.applicationCount === 0) {
    return (
      <span className="inline-flex items-center gap-[5px] rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#B00020]">
        <Icon name="x" size={11} />
        Missing
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-[5px] rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#146C44]">
      <Icon name="check" size={11} />
      {state.applicationCount === 1 ? 'Recorded' : `${state.applicationCount} products`}
    </span>
  );
}

interface Day {
  readonly key: string;
  readonly label: string;
  readonly logs: readonly ActivityLog[];
}

/**
 * Buckets rows by calendar day, preserving the order the query returned.
 *
 * Grouping is done here rather than in SQL because the sort is the user's
 * choice: sorting by employee still groups by day, it just produces days in a
 * different order, and a `group by` in the query would fight that.
 */
function groupByDay(logs: readonly ActivityLog[]): readonly Day[] {
  const days: Day[] = [];
  const index = new Map<string, ActivityLog[]>();

  for (const log of logs) {
    const key = log.startedAt.slice(0, 10);
    const bucket = index.get(key);

    if (bucket) {
      bucket.push(log);
      continue;
    }

    const fresh: ActivityLog[] = [log];
    index.set(key, fresh);
    days.push({ key, label: formatLogDate(log.startedAt), logs: fresh });
  }

  return days;
}
