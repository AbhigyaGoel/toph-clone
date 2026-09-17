'use client';

import { motion } from 'framer-motion';
import { useState, useTransition } from 'react';

import { deleteApplication } from '@/app/actions/applications';
import { RecordDialog } from '@/components/audit/RecordDialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/ToastProvider';
import { attempt } from '@/lib/attempt';
import { formatRate, isComplete, KIND_LABELS, recordIssues, reEntryState, untilClear } from '@/lib/compliance';
import { SPRING_SOFT } from '@/lib/motion';
import type { ApplicationRecord, Product } from '@/lib/types';

interface ApplicationPanelProps {
  readonly logId: string;
  readonly records: readonly ApplicationRecord[];
  readonly requiresProduct: boolean;
  readonly products: readonly Product[];
  readonly canWrite: boolean;
  readonly canRetract: boolean;
  /** For the dialog's subtitle: "Spraying on FIELD A, September 1". */
  readonly context: string;
}

/**
 * What was applied, inside the log it was applied during.
 *
 * This is the same record the Audit Manager grades, shown where the work of
 * reviewing actually happens. Before it existed, noticing that a spray had no
 * product record meant leaving the panel, finding the log again in the Audit
 * Manager, and filing it there — three navigations to do one thing, and the
 * reviewer had to remember which log they were on the whole way.
 *
 * The section is absent entirely for a log that owes nothing and has nothing. A
 * harvest does not need a line saying it had no chemicals.
 */
export function ApplicationPanel({
  logId,
  records,
  requiresProduct,
  products,
  canWrite,
  canRetract,
  context,
}: ApplicationPanelProps) {
  const [filing, setFiling] = useState(false);
  const [editing, setEditing] = useState<ApplicationRecord | null>(null);
  const [, startRetract] = useTransition();
  const toast = useToast();

  if (records.length === 0 && !requiresProduct) return null;

  const missing = records.length === 0;

  return (
    <div className="flex w-full flex-col gap-[10px] self-stretch">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
          Applied
        </span>
        {canWrite && !missing ? (
          <button
            type="button"
            onClick={() => setFiling(true)}
            className="rounded-[80px] px-[8px] py-[2px] text-[12px] font-normal leading-[1.3] text-[#146C44] outline-none transition-colors hover:bg-[rgba(20,108,68,0.08)] focus-visible:ring-2 focus-visible:ring-[#146C44]/40"
          >
            + Add another
          </button>
        ) : null}
      </div>

      {missing ? (
        <div className="flex flex-wrap items-center justify-between gap-[10px] rounded-[10px] bg-[rgba(176,0,32,0.06)] px-[14px] py-[12px]">
          <span className="flex items-start gap-[10px]">
            <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[rgba(176,0,32,0.12)] text-[#B00020]">
              <Icon name="x" size={10} />
            </span>
            <span className="flex flex-col">
              <span className="text-[13px] font-medium leading-[1.3] text-black">
                No product recorded
              </span>
              <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                This kind of work owes a compliance record. An inspection would treat it as a
                gap.
              </span>
            </span>
          </span>

          {canWrite ? (
            <motion.button
              type="button"
              onClick={() => setFiling(true)}
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SOFT}
              className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[6px] text-[13px] font-normal leading-[1.3] text-white shadow-chip"
            >
              <Icon name="plus" size={12} />
              Record product
            </motion.button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {records.map((record) => {
            const complete = isComplete(record);
            const restricted = reEntryState(record) === 'restricted';

            return (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-[8px] rounded-[10px] bg-black/[0.03] px-[14px] py-[10px]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium leading-[1.3] text-black">
                    {record.productName}
                    <span className="pl-[8px] font-normal text-[#4D4D4D]">
                      {formatRate(record)}
                      {record.areaAcres === null ? '' : ` · ${record.areaAcres} ac`}
                    </span>
                  </span>
                  <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                    {KIND_LABELS[record.kind]}
                    {record.epaRegistration ? ` · EPA ${record.epaRegistration}` : ''}
                    {record.reiHours ? ` · REI ${record.reiHours}h` : ''}
                    {record.phiDays ? ` · PHI ${record.phiDays}d` : ''}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-[6px]">
                  {restricted ? (
                    <span className="rounded-[80px] bg-[rgba(176,0,32,0.1)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#B00020]">
                      Re-entry clears in {untilClear(record)}
                    </span>
                  ) : null}

                  {complete ? (
                    <span className="flex items-center gap-[5px] rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#146C44]">
                      <Icon name="check" size={11} />
                      Ready
                    </span>
                  ) : canWrite ? (
                    <button
                      type="button"
                      onClick={() => setEditing(record)}
                      title={recordIssues(record)
                        .map((issue) => issue.message)
                        .join('; ')}
                      className="flex items-center gap-[5px] rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#B00020] outline-none transition-colors hover:bg-[rgba(176,0,32,0.16)] focus-visible:ring-2 focus-visible:ring-[#B00020]/40"
                    >
                      <Icon name="clipboard-pen" size={11} />
                      Complete it
                    </button>
                  ) : (
                    <span className="flex items-center gap-[5px] rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#B00020]">
                      <Icon name="clipboard-pen" size={11} />
                      Incomplete
                    </span>
                  )}

                  {canRetract ? (
                    <button
                      type="button"
                      aria-label={`Retract the ${record.productName} record`}
                      onClick={() => {
                        startRetract(async () => {
                          const result = await attempt(() => deleteApplication(record.id));
                          if (!result.success) toast.show({ tone: 'error', message: result.error });
                        });
                      }}
                      className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-[#B3B3B3] outline-none transition-colors hover:bg-[rgba(176,0,32,0.08)] hover:text-[#B00020] focus-visible:ring-2 focus-visible:ring-[#B00020]/40"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <RecordDialog
        open={filing || editing !== null}
        onClose={() => {
          setFiling(false);
          setEditing(null);
        }}
        products={products}
        logId={logId}
        record={editing ?? undefined}
        context={context}
      />
    </div>
  );
}
