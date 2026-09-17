'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { deleteApplication } from '@/app/actions/applications';

import { ReadinessHero } from '@/components/audit/ReadinessHero';
import { RecordDialog } from '@/components/audit/RecordDialog';
import { RegisterTable } from '@/components/audit/RegisterTable';
import { ExportButton } from '@/components/logs/ExportButton';
import { EmptyState } from '@/components/shell/EmptyState';
import { Panel } from '@/components/shell/Panel';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/ToastProvider';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { attempt } from '@/lib/attempt';
import { PERIOD_LABELS, toAuditSearch, type AuditQuery } from '@/lib/auditQuery';
import { isComplete, recordIssues } from '@/lib/compliance';
import { formatLogDate } from '@/lib/format';
import { SPRING_SOFT } from '@/lib/motion';
import type { ApplicationRecord, AuditEvent, MissingRecord, Product } from '@/lib/types';

interface AuditScreenProps {
  readonly query: AuditQuery;
  readonly records: readonly ApplicationRecord[];
  readonly missing: readonly MissingRecord[];
  readonly products: readonly Product[];
  readonly canWrite: boolean;
  readonly writeBlockedReason: string | null;
  /** Retracting a filed record is destructive, so it is gated separately. */
  readonly canRetract: boolean;
  /** The farm's recent changes, newest first. */
  readonly events: readonly AuditEvent[];
}

type Target =
  | { readonly kind: 'file'; readonly logId: string; readonly context: string }
  | { readonly kind: 'complete'; readonly record: ApplicationRecord; readonly context: string };

/**
 * The compliance register, and what is wrong with it.
 *
 * Ordered by what an inspection actually asks. First the shape of the period —
 * how many records, how many would survive scrutiny. Then, before the register
 * itself, the exceptions: an audit is passed or failed on the records that are
 * missing or short, and burying those under two hundred good rows is how they
 * stay missing. The register is last because it is the evidence, not the
 * question.
 *
 * Every exception is actionable from where it is reported. A gap that can only
 * be fixed by navigating somewhere else and remembering what you were doing is a
 * gap that stays open.
 */
export function AuditScreen({
  query,
  records,
  missing,
  products,
  canWrite,
  writeBlockedReason,
  canRetract,
  events,
}: AuditScreenProps) {
  const [target, setTarget] = useState<Target | null>(null);
  const [, startRetract] = useTransition();
  const toast = useToast();

  const incomplete = useMemo(() => records.filter((record) => !isComplete(record)), [records]);
  const exceptions = missing.length + incomplete.length;

  return (
    <>
      <PageEntrance index={1}>
        <ReadinessHero
          ready={records.length - incomplete.length}
          incomplete={incomplete.length}
          missing={missing.length}
          periodLabel={PERIOD_LABELS[query.period]}
        />
      </PageEntrance>

      <PageEntrance index={2}>
        {/*
          "Incomplete records", not "Needs attention".

          The Inbox counts today's exceptions — safety, compliance, unread — and
          says "needs attention". This counts application records that are short
          of what a filing requires, inside a chosen period. They are different
          questions with different answers, and sharing a phrase made them look
          like one number reported inconsistently in two places.
        */}
        <Panel
          title={
            exceptions === 0
              ? 'Every record in this period is complete'
              : `Incomplete records (${exceptions})`
          }
          icon="book-check"
        >
          {exceptions === 0 ? (
            <EmptyState
              icon="check"
              title="Every application in this period is fully recorded"
              body="Each log that owes a product record has one, and each record carries the rate, the treated area and — for pesticides — the registration number and the conditions at application."
            />
          ) : (
            <div className="flex flex-col">
              {missing.map((gap) => (
                <ExceptionRow
                  key={gap.logId}
                  tone="missing"
                  title={`${gap.activityName} on ${gap.fieldName} has no product record`}
                  detail={`${formatLogDate(gap.startedAt)} · ${gap.employee}`}
                  logId={gap.logId}
                  action={
                    canWrite
                      ? {
                          label: 'Record product',
                          onSelect: () =>
                            setTarget({
                              kind: 'file',
                              logId: gap.logId,
                              context: `${gap.activityName} on ${gap.fieldName}, ${formatLogDate(gap.startedAt)}, logged by ${gap.employee}.`,
                            }),
                        }
                      : null
                  }
                />
              ))}

              {incomplete.map((record) => (
                <ExceptionRow
                  key={record.id}
                  tone="incomplete"
                  title={`${record.productName} on ${record.fieldName} is missing ${listIssues(record)}`}
                  detail={`${formatLogDate(record.startedAt)} · ${record.applicator}`}
                  logId={record.logId}
                  action={
                    canWrite
                      ? {
                          label: 'Complete record',
                          onSelect: () =>
                            setTarget({
                              kind: 'complete',
                              record,
                              context: `${record.productName} applied on ${record.fieldName}, ${formatLogDate(record.startedAt)}, by ${record.applicator}.`,
                            }),
                        }
                      : null
                  }
                />
              ))}

              {!canWrite && writeBlockedReason ? (
                <p className="px-[30px] py-[16px] text-[13px] font-normal leading-[1.4] text-[#4D4D4D]">
                  {writeBlockedReason}
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      </PageEntrance>

      <PageEntrance index={3}>
        <Panel
          title={`Application register (${records.length})`}
          icon="files"
          actions={
            <ExportButton search={toAuditSearch(query)} count={records.length} kind="records" />
          }
        >
          <RegisterTable
            records={records}
            canWrite={canWrite}
            canRetract={canRetract}
            onRetract={(record) => {
              startRetract(async () => {
                const result = await attempt(() => deleteApplication(record.id));
                if (!result.success) toast.show({ tone: 'error', message: result.error });
              });
            }}
            onComplete={(record) =>
              setTarget({
                kind: 'complete',
                record,
                context: `${record.productName} applied on ${record.fieldName}, ${formatLogDate(record.startedAt)}, by ${record.applicator}.`,
              })
            }
          />
        </Panel>
      </PageEntrance>

      <RecordDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        products={products}
        logId={target?.kind === 'file' ? target.logId : undefined}
        record={target?.kind === 'complete' ? target.record : undefined}
        context={target?.context ?? ''}
      />
    </>
  );
}

interface ExceptionRowProps {
  readonly tone: 'missing' | 'incomplete';
  readonly title: string;
  readonly detail: string;
  readonly logId: string;
  readonly action: { readonly label: string; readonly onSelect: () => void } | null;
}

function ExceptionRow({ tone, title, detail, logId, action }: ExceptionRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[10px] px-[30px] py-[16px] shadow-divider">
      <div className="flex items-start gap-[12px]">
        <span
          className={`mt-[2px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full ${
            tone === 'missing'
              ? 'bg-[rgba(176,0,32,0.1)] text-[#B00020]'
              : 'bg-[rgba(176,0,32,0.06)] text-[#B00020]'
          }`}
        >
          <Icon name={tone === 'missing' ? 'x' : 'clipboard-pen'} size={11} />
        </span>
        <div className="flex flex-col">
          <span className="text-[14px] font-normal leading-[1.3] text-black">{title}</span>
          <span className="text-[13px] font-normal leading-[1.4] text-[#4D4D4D]">{detail}</span>
        </div>
      </div>

      <div className="flex items-center gap-[10px]">
        <Link
          href={`/?range=all&sort=none&open=${logId}`}
          className="rounded-[80px] px-[10px] py-[5px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-black/30"
        >
          Open log
        </Link>
        {action ? (
          <motion.button
            type="button"
            onClick={action.onSelect}
            whileHover={{ y: -1, scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={SPRING_SOFT}
            className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-white shadow-chip"
          >
            {action.label}
          </motion.button>
        ) : null}
      </div>
    </div>
  );
}

/** "the treated area and the conditions at application" */
function listIssues(record: ApplicationRecord): string {
  const parts = recordIssues(record).map((issue) =>
    issue.field === 'area'
      ? 'the treated area'
      : issue.field === 'conditions'
        ? 'the conditions at application'
        : 'an EPA registration number'
  );

  if (parts.length <= 1) return parts[0] ?? 'required detail';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

