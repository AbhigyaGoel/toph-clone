import { z } from 'zod';

/**
 * The state of the log panel's search box and toolbar chips.
 *
 * It lives in the URL rather than component state so that a refresh, a shared
 * link, and the View / Close navigation all preserve exactly what the user was
 * looking at. Only values that differ from the defaults are written, so the
 * plain dashboard URL stays `/`.
 */

export const SORT_KEYS = ['date', 'date-desc', 'employee', 'activity', 'none'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const RANGE_KEYS = ['month', 'all'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export interface LogQuery {
  readonly q: string;
  readonly sort: SortKey;
  readonly range: RangeKey;
  readonly activity: readonly string[];
  readonly field: readonly string[];
  readonly employee: readonly string[];
  readonly tag: readonly string[];
  /**
   * Ids of the rows expanded in place, oldest first.
   *
   * Expanding used to be its own route (`/logs/<id>`), which meant opening a row
   * swapped one page component for another: the whole client tree remounted, so
   * the tick boxes cleared, any open menu shut, and the round trip read as a
   * page reload. Here it is one more search param on the same route, applied
   * optimistically like every other — so a row opens on the click, and more than
   * one can be open at once.
   */
  readonly open: readonly string[];
}

/**
 * How many rows may be open together.
 *
 * Each open row costs a detail read, so the cap is what stops a hand-written URL
 * from turning one page render into an unbounded fan-out. Opening past it drops
 * the row opened longest ago, which is also the one you are least likely to
 * still be reading.
 */
export const MAX_OPEN_LOGS = 6;

/** The list-valued filters, which all behave identically. */
export const LIST_FILTER_KEYS = ['activity', 'field', 'employee', 'tag'] as const;
export type ListFilterKey = (typeof LIST_FILTER_KEYS)[number];

/** What each list filter is called when it has to appear inside a sentence. */
export const FILTER_NOUNS: Record<ListFilterKey, string> = {
  activity: 'activity',
  field: 'field',
  employee: 'employee',
  tag: 'tag',
};

/** The design's resting state: sorted by date, scoped to this month. */
export const DEFAULT_LOG_QUERY: LogQuery = {
  q: '',
  sort: 'date',
  range: 'month',
  activity: [],
  field: [],
  employee: [],
  tag: [],
  open: [],
};

/**
 * No filtering at all: every log, unsorted, nothing excluded.
 *
 * Distinct from `DEFAULT_LOG_QUERY`, which is the *design's* resting view and
 * is itself two applied filters — sorted by date and scoped to this month.
 * Reset means "show me everything", so it clears to this; resetting to the
 * defaults would leave two chips standing and silently keep hiding every log
 * outside the current month, which reads as the button not having worked.
 *
 * The search box is not a filter chip and is left alone; it has its own clear.
 * Neither are the open rows: closing what someone is reading is not part of
 * "show me everything", so `open` is outside this shape rather than reset by it.
 */
export const EMPTY_LOG_QUERY: Omit<LogQuery, 'q' | 'open'> = {
  sort: 'none',
  range: 'all',
  activity: [],
  field: [],
  employee: [],
  tag: [],
};

/** Human labels for the sort chip and the Sort menu. */
export const SORT_LABELS: Record<Exclude<SortKey, 'none'>, string> = {
  date: 'Date',
  'date-desc': 'Date (newest)',
  employee: 'Employee',
  activity: 'Activity',
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This Month',
  all: 'All Time',
};

const LIST_SEPARATOR = ',';

const first = (value: unknown): string | undefined =>
  Array.isArray(value) ? (typeof value[0] === 'string' ? value[0] : undefined) : typeof value === 'string' ? value : undefined;

/**
 * Characters a filter value may contain.
 *
 * These values are attacker-controlled URL params that end up in PostgREST
 * `in.(...)` lists. supabase-js quotes each one, so this is not the thing
 * standing between the app and injection — but a value carrying commas or
 * quotes can only ever fail to match a real activity, field, employee or tag,
 * and silently dropping it is a better answer than shipping it to the database
 * and handling the 400 that comes back.
 */
const FILTER_VALUE = /^[\p{L}\p{N} '&/.\-_]+$/u;

const csv = z.preprocess(
  (value) =>
    (first(value) ?? '')
      .split(LIST_SEPARATOR)
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 120 && FILTER_VALUE.test(item)),
  z.array(z.string().max(120)).max(50)
);

/**
 * Open-row ids, de-duplicated and capped.
 *
 * These are not filter values — they are row ids that become `in.(...)` lists on
 * a detail read, so they are held to the exact uuid shape rather than the
 * permissive filter alphabet. Anything else is dropped silently, because a stale
 * or hand-edited `open` should open fewer rows, never fail the page.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const uniqueUuids = (value: unknown): readonly string[] => {
  const seen = new Set<string>();
  for (const item of (first(value) ?? '').split(LIST_SEPARATOR)) {
    const id = item.trim().toLowerCase();
    if (UUID.test(id)) seen.add(id);
    if (seen.size >= MAX_OPEN_LOGS) break;
  }
  return [...seen];
};

const querySchema = z.object({
  q: z.preprocess((value) => (first(value) ?? '').trim().slice(0, 120), z.string()),
  sort: z.preprocess(first, z.enum(SORT_KEYS).catch(DEFAULT_LOG_QUERY.sort)),
  range: z.preprocess(first, z.enum(RANGE_KEYS).catch(DEFAULT_LOG_QUERY.range)),
  activity: csv,
  field: csv,
  employee: csv,
  tag: csv,
  open: z.preprocess(uniqueUuids, z.array(z.string()).max(MAX_OPEN_LOGS)),
});

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Parses URL search params into a `LogQuery`. Anything unrecognised falls back
 * to the default for that key, so a hand-edited or stale URL can never break
 * the page.
 */
export function parseLogQuery(params: RawSearchParams | URLSearchParams): LogQuery {
  const raw: RawSearchParams =
    params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
  return querySchema.parse(raw);
}

/**
 * Which keys to write even when they hold the default value.
 *
 * The Activity Logs archive opens on a *different* default from the dashboard —
 * all time rather than this month — and states that by redirecting to a URL
 * carrying it. Combined with "omit the default", that made one option on the
 * screen unreachable: picking "This Month" serialised to a URL with no `range`
 * at all, the page saw an unstated range and redirected straight back to
 * `range=all`. The chip snapped back every time, and the redirect was a full
 * server navigation — the white flash.
 *
 * So a screen whose defaults differ from the model's asks for those keys to be
 * written explicitly, and the redirect never fires again.
 */
export type StatedKey = 'sort' | 'range';

/** Serialises a query back to a search string, omitting defaults. */
export function toSearchString(query: LogQuery, always: readonly StatedKey[] = []): string {
  const params = new URLSearchParams();

  if (query.q) params.set('q', query.q);
  if (query.sort !== DEFAULT_LOG_QUERY.sort || always.includes('sort')) {
    params.set('sort', query.sort);
  }
  if (query.range !== DEFAULT_LOG_QUERY.range || always.includes('range')) {
    params.set('range', query.range);
  }
  for (const key of LIST_FILTER_KEYS) {
    if (query[key].length) params.set(key, query[key].join(LIST_SEPARATOR));
  }
  if (query.open.length) params.set('open', query.open.join(LIST_SEPARATOR));

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Returns a new query with one row opened or closed.
 *
 * Opening past the cap drops the oldest rather than refusing, so the control
 * never stops responding — the row you just clicked always opens.
 */
export function toggleOpenLog(query: LogQuery, logId: string): LogQuery {
  if (query.open.includes(logId)) {
    return { ...query, open: query.open.filter((id) => id !== logId) };
  }

  const next = [...query.open, logId];
  return { ...query, open: next.slice(Math.max(0, next.length - MAX_OPEN_LOGS)) };
}

/** Returns a new query with one list-valued filter toggled. */
export function toggleFilterValue(
  query: LogQuery,
  key: ListFilterKey,
  value: string
): LogQuery {
  const current = query[key];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return { ...query, [key]: next };
}

/** Start (inclusive) and end (exclusive) of the current calendar month, in UTC. */
export function currentMonthBounds(now: Date = new Date()): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/**
 * What is currently excluding rows, phrased for a sentence.
 *
 * Sort is deliberately not counted. It reorders and never hides, so listing it
 * as a reason the table is empty would send someone to change the one control
 * that cannot possibly be the cause.
 */
export function narrowingReasons(query: LogQuery): readonly string[] {
  const reasons: string[] = [];
  if (query.q.trim()) reasons.push(`the search “${query.q.trim()}”`);
  if (query.range !== 'all') reasons.push(`the ${RANGE_LABELS[query.range].toLowerCase()} range`);

  for (const key of LIST_FILTER_KEYS) {
    const values = query[key];
    if (values.length === 0) continue;
    const noun = FILTER_NOUNS[key];
    reasons.push(
      values.length === 1 ? `the ${noun} ${values[0]}` : `${values.length} ${noun} filters`
    );
  }

  return reasons;
}

/** "No logs match the search “x” and the this month range." */
export function narrowedMessageFor(reasons: readonly string[]): string {
  if (reasons.length === 0) return 'No logs match this search.';
  if (reasons.length === 1) return `No logs match ${reasons[0]}.`;
  const last = reasons[reasons.length - 1];
  return `No logs match ${reasons.slice(0, -1).join(', ')} and ${last}.`;
}
