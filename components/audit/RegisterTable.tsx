'use client';

import { EmptyState } from '@/components/shell/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { formatRate, isComplete, KIND_LABELS, recordIssues } from '@/lib/compliance';
import { formatLogDate } from '@/lib/format';
import type { ApplicationRecord } from '@/lib/types';

interface RegisterTableProps {
  readonly records: readonly ApplicationRecord[];
  readonly canWrite: boolean;
  /** Retracting a record is destructive, so it is admin-only. */
  readonly canRetract: boolean;
  readonly onComplete: (record: ApplicationRecord) => void;
  readonly onRetract: (record: ApplicationRecord) => void;
}

const ROW =
  'grid min-w-[1120px] grid-cols-[104px_1fr_120px_108px_100px_128px_116px_104px_40px] items-center gap-[8px] px-[30px]';

const HEADINGS = [
  'DATE',
  'PRODUCT',
  'FIELD',
  'RATE',
  'AREA',
  'APPLICATOR',
  'INTERVALS',
  'STATUS',
  '',
] as const;

/**
 * The evidence an inspector asks for, one row per product applied.
 *
 * Columns are chosen by what a pesticide-use record has to contain rather than
 * by what is convenient to join: what, where, how much, over what area, by whom,
 * and the two intervals that follow from the label. Conditions at application
 * are folded into the status column, because they only matter when they are
 * missing.
 *
 * A record's status is computed by `lib/compliance.ts`, not stored, so tightening
 * the rules re-grades the whole history instead of only new rows.
 */
export function RegisterTable({
  records,
  canWrite,
  canRetract,
  onComplete,
  onRetract,
}: RegisterTableProps) {
  if (records.length === 0) {
    return (
      <EmptyState
        icon="files"
        title="No applications in this period"
        body="Nothing was sprayed, fertilized or amended inside the selected window — or the filters exclude it. Widen the period to see more."
      />
    );
  }

  return (
    <div className="flex w-full flex-col overflow-x-auto">
      <div className={`${ROW} bg-white py-[12px] shadow-divider`}>
        {HEADINGS.map((heading) => (
          <span
            key={heading}
            className="text-[10px] font-medium uppercase leading-[1.3] tracking-[0.04em] text-[#B3B3B3]"
          >
            {heading}
          </span>
        ))}
      </div>

      {records.map((record) => {
        const complete = isComplete(record);

        return (
          <div
            key={record.id}
            className={`${ROW} py-[14px] shadow-divider transition-colors hover:bg-[#F8F8F8]`}
          >
            <span className="text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
              {formatLogDate(record.startedAt)}
            </span>

            <span className="flex flex-col pr-[10px]">
              <span className="text-[14px] font-normal leading-[1.3] text-black">
                {record.productName}
              </span>
              <span className="text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                {KIND_LABELS[record.kind]}
                {record.epaRegistration ? ` · EPA ${record.epaRegistration}` : ''}
              </span>
            </span>

            <span className="text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">
              {record.fieldName}
            </span>

            <span className="text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
              {formatRate(record)}
            </span>

            <span className="text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
              {record.areaAcres === null ? (
                <span className="text-[#B00020]">not recorded</span>
              ) : (
                `${record.areaAcres} ac`
              )}
            </span>

            <span className="truncate pr-[10px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">
              {record.applicator}
            </span>

            <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
              {record.reiHours ? `REI ${record.reiHours}h` : 'No REI'}
              <br />
              {record.phiDays ? `PHI ${record.phiDays}d` : 'No PHI'}
            </span>

            <span className="flex justify-start">
              {complete ? (
                <span className="inline-flex items-center gap-[5px] rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#146C44]">
                  <Icon name="check" size={11} />
                  Ready
                </span>
              ) : canWrite ? (
                <button
                  type="button"
                  onClick={() => onComplete(record)}
                  title={recordIssues(record)
                    .map((issue) => issue.message)
                    .join('; ')}
                  className="inline-flex items-center gap-[5px] rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#B00020] outline-none transition-colors hover:bg-[rgba(176,0,32,0.16)] focus-visible:ring-2 focus-visible:ring-[#B00020]/40"
                >
                  <Icon name="clipboard-pen" size={11} />
                  Incomplete
                </button>
              ) : (
                <span
                  title={recordIssues(record)
                    .map((issue) => issue.message)
                    .join('; ')}
                  className="inline-flex items-center gap-[5px] rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#B00020]"
                >
                  <Icon name="clipboard-pen" size={11} />
                  Incomplete
                </span>
              )}
            </span>

            <span className="flex justify-end">
              {/*
                Retracting a record is not the same as correcting one, so it is
                a separate, admin-only act — a record filed against the wrong
                log is evidence of something that did not happen, and leaving it
                in place is worse than the gap it filled.
              */}
              {canRetract ? (
                <button
                  type="button"
                  onClick={() => onRetract(record)}
                  aria-label={`Retract the ${record.productName} record`}
                  title="Retract this record"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[#B3B3B3] outline-none transition-colors hover:bg-[rgba(176,0,32,0.08)] hover:text-[#B00020] focus-visible:ring-2 focus-visible:ring-[#B00020]/40"
                >
                  <Icon name="trash" size={13} />
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
