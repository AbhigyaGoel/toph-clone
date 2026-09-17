import type { ApplicationRecord } from '@/lib/types';

/**
 * What makes a compliance record complete, and when a field is safe again.
 *
 * These rules are in plain TypeScript rather than in SQL on purpose. They are
 * the part of this product a farm would argue with — a certification scheme
 * changes, a state adds a required column — and a rule you can read, test and
 * change in one file is worth more than one hidden in a view definition. The
 * database still derives the two *dates*, because those are arithmetic on
 * values it owns and every screen must agree on them.
 */

/** One reason a record would not survive an inspection. */
export interface ComplianceIssue {
  /** Which part of the record is at fault, for the UI to point at. */
  readonly field: 'area' | 'conditions' | 'registration';
  readonly message: string;
}

/**
 * Everything wrong with one record.
 *
 * A pesticide application is held to more than a fertilizer one: the EPA
 * registration number and the conditions at application are on the label's
 * required record, and they are the first things asked about drift. Spreading
 * compost is not subject to either, so demanding them would train people to
 * ignore the warning.
 */
export function recordIssues(record: ApplicationRecord): readonly ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  if (record.areaAcres === null) {
    issues.push({ field: 'area', message: 'Treated area not recorded' });
  }

  if (record.kind === 'chemical') {
    if (!record.epaRegistration) {
      issues.push({ field: 'registration', message: 'No EPA registration number on the product' });
    }
    if (record.windSpeedMph === null || record.airTempF === null) {
      issues.push({ field: 'conditions', message: 'Wind and temperature not recorded' });
    }
  }

  return issues;
}

export function isComplete(record: ApplicationRecord): boolean {
  return recordIssues(record).length === 0;
}

/**
 * Whether anyone may enter the field this record covers.
 *
 * "restricted" means the restricted-entry interval has not yet elapsed. A
 * product with no REI never restricts, which is why the null case is `clear`
 * rather than an unknown.
 */
export function reEntryState(
  record: ApplicationRecord,
  now: Date = new Date()
): 'restricted' | 'clear' {
  if (record.reiHours === null || record.reiHours === 0) return 'clear';
  return new Date(record.reiExpiresAt) > now ? 'restricted' : 'clear';
}

/**
 * The record that governs a field right now: the one whose restriction ends
 * last. A tank mix of a 4-hour and a 24-hour product keeps the field closed for
 * 24 hours, and showing the 4-hour one because it was applied second would send
 * somebody back in too early.
 */
export function governingRestriction(
  records: readonly ApplicationRecord[],
  now: Date = new Date()
): ApplicationRecord | null {
  const active = records.filter((record) => reEntryState(record, now) === 'restricted');
  if (active.length === 0) return null;

  return active.reduce((latest, record) =>
    new Date(record.reiExpiresAt) > new Date(latest.reiExpiresAt) ? record : latest
  );
}

/** "in 3h 20m" / "in 45m", for a restriction that has not yet lifted. */
export function untilClear(record: ApplicationRecord, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((new Date(record.reiExpiresAt).getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** `0.5 gal/acre` — the rate as it would be written on the record. */
export function formatRate(record: Pick<ApplicationRecord, 'rate' | 'rateUnit'>): string {
  // Stored as numeric(10,3); trailing zeros are an artefact of the column width,
  // not a claim about precision.
  const rate = Number(record.rate);
  const text = Number.isInteger(rate) ? String(rate) : String(Number(rate.toFixed(3)));
  return `${text} ${record.rateUnit}`;
}

export const KIND_LABELS: Record<ApplicationRecord['kind'], string> = {
  chemical: 'Chemical',
  fertilizer: 'Fertilizer',
  amendment: 'Amendment',
};
