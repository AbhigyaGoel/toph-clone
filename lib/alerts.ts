import { governingRestriction, recordIssues, untilClear } from '@/lib/compliance';
import { formatLogDate } from '@/lib/format';
import type {
  ActivityLog,
  ApplicationRecord,
  EmployeeOverview,
  MissingRecord,
} from '@/lib/types';

/**
 * What the farm's own data is trying to tell you.
 *
 * Everything here is derived from rows that already exist — no notifications
 * table, no background job, nothing to keep in sync. That is the whole design:
 * an alert is a *query*, so it cannot go stale, cannot be marked read while the
 * underlying problem persists, and disappears the moment the problem is fixed.
 * A stored notification would need all three of those handled by hand, and the
 * first bug would be a cleared alert for a gap that is still open.
 *
 * The cost is that they cannot be dismissed, which is the right trade for this
 * product. Every rule below describes something a farm has to act on, not
 * something it might like to know.
 */

export type AlertSeverity = 'urgent' | 'warning' | 'info';

export interface Alert {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly body: string;
  readonly at: string;
  readonly href: string;
  readonly actionLabel: string;
}

/** Below this, a transcript usually needs reading against the audio. */
const LOW_CONFIDENCE = 0.8;

/** A log left unreviewed longer than this has slipped, not been triaged. */
const STALE_REVIEW_DAYS = 7;

export interface AlertInputs {
  readonly logs: readonly ActivityLog[];
  readonly records: readonly ApplicationRecord[];
  readonly missing: readonly MissingRecord[];
  readonly crew: readonly EmployeeOverview[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { urgent: 0, warning: 1, info: 2 };

export function buildAlerts(inputs: AlertInputs, now: Date = new Date()): readonly Alert[] {
  const alerts: Alert[] = [
    ...reEntryAlerts(inputs.records, now),
    ...missingRecordAlerts(inputs.missing),
    ...incompleteRecordAlerts(inputs.records),
    ...staleReviewAlerts(inputs.logs, now),
    ...transcriptionAlerts(inputs.crew),
  ];

  // Most urgent first, and within a severity the most recent — a safety notice
  // from an hour ago outranks one from yesterday.
  return alerts.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.at.localeCompare(a.at)
  );
}

/** Somebody could walk into a field that is still under a restriction. */
function reEntryAlerts(records: readonly ApplicationRecord[], now: Date): readonly Alert[] {
  const byField = new Map<string, ApplicationRecord[]>();
  for (const record of records) {
    const bucket = byField.get(record.fieldId);
    if (bucket) bucket.push(record);
    else byField.set(record.fieldId, [record]);
  }

  return [...byField.values()]
    .map((forField) => governingRestriction(forField, now))
    .filter((record): record is ApplicationRecord => record !== null)
    .map((record) => ({
      id: `rei:${record.fieldId}`,
      severity: 'urgent' as const,
      title: `${record.fieldName} is under a re-entry restriction`,
      body: `${record.productName} was applied ${formatLogDate(record.startedAt)} with a ${record.reiHours}-hour restricted-entry interval. Nobody should enter for another ${untilClear(record, now)}.`,
      at: record.endedAt,
      href: `/map?field=${record.fieldId}`,
      actionLabel: 'View field',
    }));
}

/** A spray or fertilizer log that never produced a compliance record. */
function missingRecordAlerts(missing: readonly MissingRecord[]): readonly Alert[] {
  return missing.map((gap) => ({
    id: `missing:${gap.logId}`,
    severity: 'warning' as const,
    title: `${gap.activityName} on ${gap.fieldName} has no product record`,
    body: `${gap.employee} logged this on ${formatLogDate(gap.startedAt)}, but nothing was recorded about what was applied. An inspection would treat this as a gap.`,
    at: gap.startedAt,
    // Straight to the log with its panel open, where the record can be filed
    // in place. Sending them to the Audit Manager would mean finding this same
    // log again in a list they have just been told about.
    href: `/?range=all&sort=none&open=${gap.logId}`,
    actionLabel: 'Record it',
  }));
}

/** A record that exists but would not survive scrutiny. */
function incompleteRecordAlerts(records: readonly ApplicationRecord[]): readonly Alert[] {
  return records
    .filter((record) => recordIssues(record).length > 0)
    .map((record) => ({
      id: `incomplete:${record.id}`,
      severity: 'warning' as const,
      title: `${record.productName} on ${record.fieldName} is an incomplete record`,
      body: `${recordIssues(record)
        .map((issue) => issue.message)
        .join('. ')}. Applied ${formatLogDate(record.startedAt)} by ${record.applicator}.`,
      at: record.startedAt,
      href: `/?range=all&sort=none&open=${record.logId}`,
      actionLabel: 'Complete it',
    }));
}

/** Logs that have sat unreviewed long enough to have been forgotten. */
function staleReviewAlerts(logs: readonly ActivityLog[], now: Date): readonly Alert[] {
  const cutoff = now.getTime() - STALE_REVIEW_DAYS * 24 * 60 * 60 * 1000;
  const stale = logs.filter(
    (log) => log.status === 'new' && new Date(log.startedAt).getTime() < cutoff
  );

  if (stale.length === 0) return [];

  const oldest = stale.reduce((earliest, log) =>
    log.startedAt < earliest.startedAt ? log : earliest
  );

  // One alert for the set rather than one per log: "you have a backlog" is a
  // single fact, and eleven copies of it would bury everything else here.
  return [
    {
      id: 'stale-review',
      severity: 'warning',
      title: `${stale.length} ${stale.length === 1 ? 'log has' : 'logs have'} been waiting over ${STALE_REVIEW_DAYS} days for review`,
      body: `The oldest is ${oldest.employee}'s ${oldest.activity.toLowerCase()} on ${oldest.field} from ${formatLogDate(oldest.startedAt)}.`,
      at: oldest.startedAt,
      href: '/?range=all&sort=date',
      actionLabel: 'Review them',
    },
  ];
}

/** A worker whose recordings are transcribing badly enough to need looking at. */
function transcriptionAlerts(crew: readonly EmployeeOverview[]): readonly Alert[] {
  return crew
    .filter(
      (member) =>
        member.recordingCount > 0 &&
        member.meanConfidence !== null &&
        member.meanConfidence < LOW_CONFIDENCE
    )
    .map((member) => ({
      id: `transcription:${member.id}`,
      severity: 'info' as const,
      title: `${member.name}'s recordings transcribe at ${Math.round((member.meanConfidence ?? 0) * 100)}%`,
      body: `Across ${member.recordingCount} ${member.recordingCount === 1 ? 'recording' : 'recordings'}, well below the rest of the crew. Usually a noisy cab or a phone held too far away — worth checking before the transcripts are trusted.`,
      at: member.lastLoggedAt ?? '',
      href: `/activity-logs?range=all&sort=date-desc&employee=${encodeURIComponent(member.name)}`,
      actionLabel: 'Their logs',
    }));
}
