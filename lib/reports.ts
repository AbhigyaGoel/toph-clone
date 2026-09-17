import type { ActivityLog, ApplicationRecord } from '@/lib/types';

/**
 * The arithmetic behind the Reports screen.
 *
 * Pure functions over rows the repositories already return, kept apart from the
 * components that draw them. Two reasons: the same totals appear on more than
 * one screen and must agree, and "how is a week bucketed" is the kind of
 * decision that is easy to get subtly wrong and impossible to review when it is
 * spread through JSX.
 *
 * Deliberately not SQL. These aggregate a season — hundreds of rows, not
 * millions — and at that size the round trip costs more than the loop. The
 * rollups that *are* per-row-expensive (`field_activity`, `dashboard_stats`)
 * are views; the cut is drawn at what the database is actually better at.
 */

export interface Slice {
  readonly label: string;
  /** Hours, rounded to one decimal — the unit every report here is in. */
  readonly hours: number;
  readonly logs: number;
}

/** Shift length in hours. The only place this conversion happens. */
export function logHours(log: ActivityLog): number {
  return (new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()) / 3_600_000;
}

export function totalHours(logs: readonly ActivityLog[]): number {
  return round(logs.reduce((sum, log) => sum + logHours(log), 0));
}

const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * Groups logs by one of their labels and totals the hours in each group.
 *
 * Sorted by hours descending, because every question this answers — which job
 * eats the week, which block costs the most labour, who is carrying the crew —
 * is a question about the top of the list.
 */
export function groupHours(
  logs: readonly ActivityLog[],
  by: (log: ActivityLog) => string
): readonly Slice[] {
  const index = new Map<string, { hours: number; logs: number }>();

  for (const log of logs) {
    const key = by(log);
    const current = index.get(key) ?? { hours: 0, logs: 0 };
    index.set(key, { hours: current.hours + logHours(log), logs: current.logs + 1 });
  }

  return [...index.entries()]
    .map(([label, totals]) => ({ label, hours: round(totals.hours), logs: totals.logs }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
}

export interface WeekBucket {
  /** ISO date of the Monday that starts the week. */
  readonly start: string;
  readonly label: string;
  readonly hours: number;
  readonly logs: number;
}

/**
 * Weekly buckets covering the whole span, including weeks with nothing in them.
 *
 * The empty weeks are the point. A column chart that silently skips them draws
 * a fortnight's gap as if it never happened, which turns "we lost a week to
 * rain" into "nothing unusual".
 *
 * Weeks start on Monday and are computed in UTC, matching how every timestamp
 * in this app is stored and displayed — a local-time week boundary would move
 * logs between columns depending on where the browser is.
 */
export function weeklyHours(logs: readonly ActivityLog[], now: Date = new Date()): readonly WeekBucket[] {
  if (logs.length === 0) return [];

  const stamps = logs.map((log) => new Date(log.startedAt).getTime());
  const first = mondayOf(new Date(Math.min(...stamps)));
  const last = mondayOf(new Date(Math.max(Math.max(...stamps), now.getTime())));

  const totals = new Map<string, { hours: number; logs: number }>();
  for (const log of logs) {
    const key = mondayOf(new Date(log.startedAt)).toISOString().slice(0, 10);
    const current = totals.get(key) ?? { hours: 0, logs: 0 };
    totals.set(key, { hours: current.hours + logHours(log), logs: current.logs + 1 });
  }

  const weeks: WeekBucket[] = [];
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 7)) {
    const start = cursor.toISOString().slice(0, 10);
    const bucket = totals.get(start) ?? { hours: 0, logs: 0 };
    weeks.push({ start, label: weekLabel(cursor), hours: round(bucket.hours), logs: bucket.logs });
  }

  // A season is long; the chart shows the most recent stretch rather than
  // shrinking every column to fit a year on screen.
  return weeks.slice(-16);
}

function mondayOf(date: Date): Date {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(monday: Date): string {
  return `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()}`;
}

export interface ProductUsage {
  readonly productId: string;
  readonly name: string;
  readonly kind: ApplicationRecord['kind'];
  readonly unit: string;
  readonly applications: number;
  /** Total rate x area, where both are known. Null when no area was recorded. */
  readonly totalApplied: number | null;
  readonly acresTreated: number | null;
  readonly fields: number;
}

/**
 * How much of each product went out.
 *
 * `totalApplied` multiplies rate by treated area, so it is only meaningful when
 * every application of that product recorded its area — one missing area makes
 * the total a lie, so it becomes null rather than an undercount. That is the
 * same judgement the Audit Manager makes about an incomplete record, applied to
 * a number instead of a row.
 */
export function productUsage(records: readonly ApplicationRecord[]): readonly ProductUsage[] {
  const index = new Map<string, ApplicationRecord[]>();

  for (const record of records) {
    const bucket = index.get(record.productId);
    if (bucket) bucket.push(record);
    else index.set(record.productId, [record]);
  }

  return [...index.entries()]
    .map(([productId, forProduct]) => {
      const complete = forProduct.every((record) => record.areaAcres !== null);
      const acres = complete
        ? round(forProduct.reduce((sum, record) => sum + (record.areaAcres ?? 0), 0))
        : null;

      return {
        productId,
        name: forProduct[0].productName,
        kind: forProduct[0].kind,
        unit: forProduct[0].rateUnit,
        applications: forProduct.length,
        totalApplied: complete
          ? round(forProduct.reduce((sum, r) => sum + r.rate * (r.areaAcres ?? 0), 0))
          : null,
        acresTreated: acres,
        fields: new Set(forProduct.map((record) => record.fieldId)).size,
      };
    })
    .sort((a, b) => b.applications - a.applications || a.name.localeCompare(b.name));
}
