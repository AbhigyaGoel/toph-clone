import { describeAnomaly, type RateAnomaly } from '@/lib/anomaly';
import { complianceChecks, LISTEN_BELOW, warningCount } from '@/lib/extraction';
import type { ApplicationRecord, ExtractedFields, InboxItem, RestrictedField } from '@/lib/types';

/**
 * The inbox: everything waiting on the manager, not just the worst five.
 *
 * The dashboard's queue answers "what do I do first" and is capped at five on
 * purpose — a triage list that scrolls has stopped triaging. That cap leaves a
 * real question unanswered: what about the sixth thing? The Audit Manager holds
 * the whole archive, but it is a compliance register, organised by period and
 * built for working through records rather than for clearing a day's arrivals.
 *
 * So this is the middle screen, and it is shaped like an inbox because that is
 * the job: items arrive on their own, each one is either dealt with or it is
 * not, and the list should empty. Nothing here is invented for the sake of the
 * metaphor — every item is a real state of real data, and each one leaves the
 * inbox when that state changes:
 *
 *   * a restricted field leaves when its re-entry interval elapses,
 *   * a compliance gap leaves when the record is completed or corrected,
 *   * a log awaiting review leaves when someone marks it reviewed.
 *
 * There is deliberately no separate "read" flag. A read flag that does not
 * change the record is a second, private truth about a log, and the day it
 * disagrees with the log's actual status is the day the inbox starts lying.
 * Marking an item read here marks the log reviewed, which is the thing the
 * manager actually meant.
 */

interface InboxLogInput {
  readonly logId: string;
  readonly employeeName: string;
  readonly activityName: string;
  readonly fieldName: string;
  readonly confidence: number | null;
  readonly extracted: ExtractedFields | null;
  readonly records: readonly ApplicationRecord[];
  readonly requiresProduct: boolean;
  readonly status: 'new' | 'reviewed';
  readonly startedAt: string;
}

/** Ordered by consequence. */
const RANK = { safety: 0, compliance: 1, anomaly: 2, quality: 3, review: 4 } as const;

/** Below this many hours left, a re-entry window is worth flagging early. */
export const EXPIRING_SOON_HOURS = 4;

/** What the dashboard says about the inbox without repeating it. */
export interface AttentionSummary {
  readonly total: number;
  readonly safety: number;
  readonly compliance: number;
  readonly anomaly: number;
  /** Ids of logs with something actually wrong, so the table can mark rows. */
  readonly flaggedLogIds: readonly string[];
}

export function summarise(items: readonly InboxItem[]): AttentionSummary {
  return {
    total: items.length,
    safety: items.filter((item) => item.severity === 'safety').length,
    compliance: items.filter((item) => item.severity === 'compliance').length,
    anomaly: items.filter((item) => item.severity === 'anomaly').length,
    flaggedLogIds: items
      .filter((item) => item.kind === 'log' && item.severity !== 'review')
      .map((item) => item.id),
  };
}

/**
 * Fields nobody should walk into yet.
 *
 * First in the inbox for the same reason they are first on the dashboard: this
 * is the only item on the list where the cost of missing it is a person rather
 * than a penalty.
 */
export function restrictionItems(fields: readonly RestrictedField[]): readonly InboxItem[] {
  return fields.map((field) => ({
    kind: 'field' as const,
    id: field.fieldId,
    title: `${field.fieldName} is under a re-entry restriction`,
    reason: `No entry until ${clockTime(field.clearsAt)} after ${field.productName}`,
    severity: 'safety' as const,
    at: field.clearsAt,
    from: 'Re-entry interval',
    actionable: false,
    restriction: { productName: field.productName, clearsAt: field.clearsAt },
  }));
}

/**
 * One item per log that has something wrong with it, or has not been read yet.
 *
 * A log can be both — an unreviewed spray with a missing product record — and
 * it still gets one line. The inbox is a list of things to open, and opening it
 * twice is not twice the work.
 */
export function logItems(logs: readonly InboxLogInput[]): readonly InboxItem[] {
  const items: InboxItem[] = [];

  for (const log of logs) {
    const checks = complianceChecks(log.extracted, log.records, log.requiresProduct);
    const warnings = warningCount(checks);
    const lowConfidence = log.confidence !== null && log.confidence < LISTEN_BELOW;
    const unread = log.status === 'new';

    if (warnings === 0 && !lowConfidence && !unread) continue;

    const severity = warnings > 0 ? 'compliance' : lowConfidence ? 'quality' : 'review';

    items.push({
      kind: 'log',
      id: log.logId,
      title: `${log.employeeName} — ${log.activityName.toLowerCase()} on ${log.fieldName}`,
      reason: describe(warnings, lowConfidence, log.confidence, checks),
      severity,
      at: log.startedAt,
      from: log.employeeName,
      // Only a log can be marked reviewed from here. A restriction clears when
      // the interval elapses, and a button that pretends otherwise would be
      // offering to dismiss a safety notice.
      actionable: unread,
    });
  }

  return items;
}

/**
 * Rates that are real but unusual.
 *
 * Ranked below a compliance gap and above a bad recording, which is where the
 * consequence sits: a missing record fails an audit outright, an over-applied
 * rate might be a label violation and might be a typo, and a poor transcript is
 * only ever a reason to listen again.
 *
 * Worded as a comparison rather than a verdict. The dashboard does not know
 * that 2 gal/acre is wrong — it knows this applicator has put on 0.5 five times
 * running, and that the person who can settle it is the one being shown.
 */
export function anomalyItems(anomalies: readonly RateAnomaly[]): readonly InboxItem[] {
  return anomalies.map((anomaly) => ({
    kind: 'log' as const,
    id: anomaly.logId,
    title: `${anomaly.employeeName} — ${anomaly.productName} rate on ${anomaly.fieldName}`,
    reason: describeAnomaly(anomaly),
    severity: 'anomaly' as const,
    at: anomaly.appliedAt,
    from: anomaly.employeeName,
    actionable: false,
    anomaly: {
      rate: anomaly.rate,
      average: anomaly.average,
      multiple: anomaly.multiple,
      rateUnit: anomaly.rateUnit,
      sampleSize: anomaly.sampleSize,
      direction: anomaly.direction,
    },
  }));
}

/**
 * Merges the anomalies into the log list without doubling a log up.
 *
 * A log can have a missing record *and* an odd rate. Two rows for one log would
 * make the inbox count read as more wrong than the farm is, so the harder
 * severity wins the row and the anomaly's wording is folded into its reason.
 */
export function mergeItems(
  logs: readonly InboxItem[],
  anomalies: readonly InboxItem[]
): readonly InboxItem[] {
  const byLog = new Map(logs.map((item) => [item.id, item]));
  const out = [...logs];

  for (const anomaly of anomalies) {
    const existing = byLog.get(anomaly.id);
    if (!existing) {
      out.push(anomaly);
      continue;
    }

    const index = out.indexOf(existing);
    out[index] = {
      ...existing,
      reason:
        RANK[existing.severity] <= RANK.anomaly
          ? `${existing.reason}, and the rate is ${anomaly.anomaly?.multiple}x their usual`
          : anomaly.reason,
      severity: RANK[existing.severity] <= RANK.anomaly ? existing.severity : anomaly.severity,
      anomaly: anomaly.anomaly,
    };
  }

  return out;
}

/** Worst first, then newest — the order a person would sort their own morning. */
export function sortInbox(items: readonly InboxItem[]): readonly InboxItem[] {
  return [...items].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] || new Date(b.at).getTime() - new Date(a.at).getTime()
  );
}

function describe(
  warnings: number,
  lowConfidence: boolean,
  confidence: number | null,
  checks: ReturnType<typeof complianceChecks>
): string {
  const heard = `the audio came through at ${Math.round((confidence ?? 0) * 100)}%`;

  if (warnings > 0 && lowConfidence) {
    return `${warnings} compliance ${warnings === 1 ? 'gap' : 'gaps'}, and ${heard}`;
  }
  if (warnings > 0) {
    const first = checks.find((check) => check.state === 'warn')?.label.toLowerCase();
    return `${warnings} compliance ${warnings === 1 ? 'gap' : 'gaps'} — ${first ?? 'incomplete'}`;
  }
  if (lowConfidence) {
    return `Filed, but ${heard} — worth a listen`;
  }
  return 'Filed and waiting to be reviewed';
}

/** "6:00 PM" — a farm runs on clock time, not on timestamps. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}
