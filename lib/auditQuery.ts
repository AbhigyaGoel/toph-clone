import { z } from 'zod';

import type { RawSearchParams } from '@/lib/logQuery';

/**
 * The Audit Manager's period, in the URL.
 *
 * Presets rather than two date inputs. An audit is nearly always assembled for
 * a named window — a certification year, the last quarter, "since the last
 * inspection" — and a pair of calendar pickers makes the common case the slow
 * one. "All time" is included because the farm's whole history is itself an
 * answer an inspector asks for.
 */

export const PERIOD_KEYS = ['30', '90', 'year', 'all'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  year: 'This year',
  all: 'All time',
};

export const KIND_KEYS = ['chemical', 'fertilizer', 'amendment'] as const;
export type KindKey = (typeof KIND_KEYS)[number];

export interface AuditQuery {
  readonly period: PeriodKey;
  /** Empty means every kind. */
  readonly kind: KindKey | null;
  /** Empty means every field. */
  readonly fieldId: string | null;
}

/** The whole seeded history sits inside a year, so this shows everything. */
export const DEFAULT_AUDIT_QUERY: AuditQuery = { period: 'year', kind: null, fieldId: null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const first = (value: unknown): string | undefined =>
  Array.isArray(value)
    ? typeof value[0] === 'string'
      ? value[0]
      : undefined
    : typeof value === 'string'
      ? value
      : undefined;

const schema = z.object({
  period: z.preprocess(first, z.enum(PERIOD_KEYS).catch(DEFAULT_AUDIT_QUERY.period)),
  kind: z.preprocess(first, z.enum(KIND_KEYS).nullable().catch(null)),
  fieldId: z.preprocess(
    (value) => {
      const id = (first(value) ?? '').toLowerCase();
      return UUID.test(id) ? id : null;
    },
    z.string().nullable()
  ),
});

export function parseAuditQuery(params: RawSearchParams): AuditQuery {
  return schema.parse({ period: params.period, kind: params.kind, fieldId: params.field });
}

export function toAuditSearch(query: AuditQuery): string {
  const params = new URLSearchParams();
  if (query.period !== DEFAULT_AUDIT_QUERY.period) params.set('period', query.period);
  if (query.kind) params.set('kind', query.kind);
  if (query.fieldId) params.set('field', query.fieldId);

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * The period as an instant bound.
 *
 * `from` is inclusive, `to` is left open — an audit window that ended yesterday
 * is not a thing anyone asks for, and leaving the upper bound off means a record
 * filed while the page is open still appears.
 */
export function periodBounds(period: PeriodKey, now: Date = new Date()): { from?: string } {
  if (period === 'all') return {};

  if (period === 'year') {
    return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString() };
  }

  const days = Number(period);
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString() };
}
