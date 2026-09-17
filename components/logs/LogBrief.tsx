'use client';

import { ApplicationPanel } from '@/components/dashboard/ApplicationPanel';
import { ExtractedFields } from '@/components/dashboard/ExtractedFields';
import { Icon } from '@/components/ui/Icon';
import type { LogDetail, Product, ReferenceData } from '@/lib/types';

interface LogBriefProps {
  readonly detail: LogDetail;
  readonly employeeLabel: string;
  readonly fieldLabel: string;
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly recordContext: string;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
}

/**
 * A log's substance, without the dashboard panel's chrome.
 *
 * Used wherever a row opens somewhere other than the dashboard — the Inbox and
 * the Activity Logs archive. Both had the same bug for the same reason: a row
 * that described a log, and an "Open" that navigated to the dashboard and left
 * the reader hunting a table for the row they had just clicked. A list you
 * cannot open in place is an index, not a screen.
 *
 * Deliberately not the dashboard's full panel. That one is the whole log —
 * player, map, tags, edit, delete — because the dashboard is where you go to
 * *work on* a log. Here the question is narrower: what was said, what was read
 * out of it, and is the paperwork there. Three blocks, which is what both
 * callers actually need.
 *
 * Reusing `ExtractedFields` and `ApplicationPanel` rather than reimplementing
 * them is the point: a correction made here re-derives the same compliance
 * checks and writes the same record as one made on the dashboard. Two screens
 * disagreeing about whether a log is compliant would be worse than either
 * screen missing a feature.
 */
export function LogBrief({
  detail,
  employeeLabel,
  fieldLabel,
  products,
  reference,
  recordContext,
  canWrite,
  canRetract,
}: LogBriefProps) {
  const recording = detail.recording;
  // The English rendering when there is one, because this screen is read by the
  // manager. The original is never replaced — it is the record, and the full log
  // still shows it in the language it was spoken.
  const words = recording ? (recording.translation ?? recording.summary) : null;
  const translated = Boolean(recording?.translation);

  return (
    <div className="flex flex-col gap-[16px] border-t border-black/[0.06] bg-black/[0.015] px-[16px] py-[18px] sm:px-[30px]">
      {/*
        The words first. Every compliance gap below traces back to something the
        worker did or did not say, and a manager who cannot see the sentence is
        being asked to trust the extraction — which is the one thing this screen
        exists to let them stop doing.
      */}
      {words ? (
        <div className="flex flex-col gap-[6px]">
          <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            What was said
          </span>
          <p className="max-w-[760px] text-[13px] font-normal leading-[1.55] text-[#4D4D4D]">
            {words}
          </p>
          {translated ? (
            <span className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">
              Translated from {recording?.language === 'es' ? 'Spanish' : recording?.language} — the
              original wording is kept on the log.
            </span>
          ) : null}
        </div>
      ) : (
        <span className="text-[13px] font-normal leading-[1.4] text-[#B3B3B3]">
          Entered by hand — there is no recording behind this log.
        </span>
      )}

      <div className="grid gap-[16px] xl:grid-cols-2">
        <ExtractedFields
          logId={detail.logId}
          extracted={recording?.extracted ?? null}
          records={detail.applications}
          requiresProduct={detail.requiresProduct}
          products={products}
          reference={reference}
          canWrite={canWrite}
        />

        <div className="flex flex-col gap-[10px]">
          <ApplicationPanel
            logId={detail.logId}
            records={detail.applications}
            requiresProduct={detail.requiresProduct}
            products={products}
            context={recordContext}
            canWrite={canWrite}
            canRetract={canRetract}
          />

          <a
            href={`/?range=all&open=${detail.logId}`}
            className="flex items-center gap-[6px] self-start rounded-[80px] px-[10px] py-[6px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <Icon name="expand" size={11} />
            Open the full log — {employeeLabel} on {fieldLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
