'use client';

import { useMemo } from 'react';

import { useLogQueryNavigation } from '@/components/dashboard/useLogQueryNavigation';
import { ArchiveTable, type ArchiveRecordState } from '@/components/logs/ArchiveTable';
import { ExportButton } from '@/components/logs/ExportButton';
import { FilterRail } from '@/components/logs/FilterRail';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { formatLogDate } from '@/lib/format';
import { toSearchString } from '@/lib/logQuery';
import { totalHours } from '@/lib/reports';
import type {
  ActivityLog,
  FilterOptions,
  LogDetail,
  Product,
  ReferenceData,
} from '@/lib/types';

interface ActivityLogsScreenProps {
  readonly logs: readonly ActivityLog[];
  readonly records: Readonly<Record<string, ArchiveRecordState>>;
  readonly filterOptions: FilterOptions;
  /** Detail for rows the URL asks to be open, so they expand here. */
  readonly details: readonly LogDetail[];
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
}

/**
 * The archive: a filter rail beside a dense result list.
 *
 * Two columns rather than the stacked summary-then-table every reporting screen
 * defaults to, because this screen is a search and a search has two parts —
 * what you are asking for, and what came back. Keeping the question visible
 * beside the answer is what lets you refine it without losing your place.
 *
 * There is no card strip. The numbers a strip would have shown are one sentence
 * — how many logs, how many hours, over what span — and a sentence is the right
 * size for something that only exists to tell you whether your filter did what
 * you meant.
 */
export function ActivityLogsScreen({
  logs,
  records,
  filterOptions,
  details,
  products,
  reference,
  canWrite,
  canRetract,
}: ActivityLogsScreenProps) {
  const { query, isPending } = useLogQueryNavigation();

  const summary = useMemo(() => {
    if (logs.length === 0) return null;

    const stamps = logs.map((log) => log.startedAt).sort();
    const missing = logs.filter(
      (log) => records[log.id]?.requiresProduct && (records[log.id]?.applicationCount ?? 0) === 0
    ).length;

    return {
      hours: totalHours(logs),
      from: stamps[0],
      to: stamps[stamps.length - 1],
      missing,
    };
  }, [logs, records]);

  return (
    <PageEntrance index={1} fill>
      <div className="flex w-full flex-col gap-[10px] self-stretch xl:min-h-0 xl:flex-1 xl:flex-row">
        <FilterRail options={filterOptions} />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-white shadow-panel xl:min-h-0">
          <div className="flex flex-col items-start gap-[10px] px-[16px] py-[16px] shadow-divider sm:px-[30px] lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[14px] font-normal leading-[1.4] text-[#4D4D4D]">
              {summary === null ? (
                'No logs match this search.'
              ) : (
                <>
                  <span className="font-medium text-black">{logs.length}</span>{' '}
                  {logs.length === 1 ? 'log' : 'logs'} ·{' '}
                  <span className="font-medium text-black">{summary.hours}h</span> ·{' '}
                  {formatLogDate(summary.from)}
                  {summary.from.slice(0, 10) === summary.to.slice(0, 10)
                    ? ''
                    : ` – ${formatLogDate(summary.to)}`}
                  {summary.missing > 0 ? (
                    <span className="text-[#B00020]">
                      {' '}
                      · {summary.missing} {summary.missing === 1 ? 'log is' : 'logs are'} missing a
                      product record
                    </span>
                  ) : null}
                </>
              )}
            </p>

            <ExportButton search={toSearchString(query)} count={logs.length} />
          </div>

          <div className="flex w-full flex-col self-stretch xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <ArchiveTable
              logs={logs}
              records={records}
              pending={isPending}
              details={details}
              products={products}
              reference={reference}
              canWrite={canWrite}
              canRetract={canRetract}
            />
          </div>
        </section>
      </div>
    </PageEntrance>
  );
}
