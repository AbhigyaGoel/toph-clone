import { z } from 'zod';

import { logger } from '@/lib/logger';
import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { FieldOverview, MapPlot } from '@/lib/types';

const plotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

/** Aggregates come back from `count()` as numbers and `max()` as a string. */
const overviewSchema = z.object({
  field_id: z.string().uuid(),
  name: z.string(),
  map_plot: plotSchema,
  log_count: z.coerce.number().int().nonnegative(),
  unreviewed_count: z.coerce.number().int().nonnegative(),
  last_worked_at: z.string().nullable(),
});

/**
 * Every field with its plot and how much has happened on it.
 *
 * Reads the `field_activity` view rather than counting in the app: the map
 * needs one number and one date per field, and a left join in Postgres is both
 * cheaper and keeps an unworked field in the result — which is precisely the
 * field a manager opens the map to find.
 */
export async function findFieldOverviews(orgId: string): Promise<readonly FieldOverview[]> {
  const { data, error } = await getSupabase()
    .from('field_activity')
    .select('field_id, name, map_plot, log_count, unreviewed_count, last_worked_at')
    .eq('org_id', orgId)
    .order('name');

  if (error) {
    throw new RepositoryError('findFieldOverviews', error.message);
  }

  return z
    .array(overviewSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.field_id,
      name: row.name,
      plot: row.map_plot,
      logCount: row.log_count,
      unreviewedCount: row.unreviewed_count,
      lastWorkedAt: row.last_worked_at,
    }));
}

/**
 * One person on the live map: out now, or where they last were.
 *
 * Find My's model, and the right one here. A farm map that only draws people
 * while they happen to be clocked on is blank for most of the day and useless
 * at exactly the moment a manager opens it — 7am, before anyone is out, or the
 * evening, after everyone has gone. "Ben, Field K, finished 11:30" is a real
 * answer to "where is everybody"; an empty map is not.
 *
 * The distinction is drawn honestly: `working` is somebody whose log is open
 * right now, `last-seen` is their most recent finished log, dimmed and
 * timestamped. A stale position that looks live would be the one thing on this
 * screen somebody might act on wrongly.
 */
export interface FieldWorker {
  readonly logId: string;
  readonly employeeName: string;
  readonly shortName: string;
  readonly activityName: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly plot: MapPlot;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly working: boolean;
}

/** How far back a finished log still counts as "where they last were". */
const LAST_SEEN_HOURS = 14;

export async function findFieldWorkers(
  orgId: string,
  now: Date = new Date()
): Promise<readonly FieldWorker[]> {
  const since = new Date(now.getTime() - LAST_SEEN_HOURS * 3_600_000).toISOString();

  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select(
      'id, started_at, ended_at, employees ( full_name ), fields ( id, name, map_plot ), activity_types ( name )'
    )
    .eq('org_id', orgId)
    .gte('ended_at', since)
    .order('started_at', { ascending: false });

  if (error) {
    logger.error('findFieldWorkers', error.message);
    return [];
  }

  const instant = now.toISOString();
  const byEmployee = new Map<string, FieldWorker>();

  for (const row of data ?? []) {
    const field = row.fields;
    const plot = plotSchema.safeParse(field?.map_plot);
    const employeeName = row.employees?.full_name;
    if (!field || !employeeName || !plot.success) continue;

    const working = row.started_at <= instant && instant <= row.ended_at;
    const held = byEmployee.get(employeeName);

    // One marker per person. A log in progress always wins; otherwise the most
    // recent, which the ordering above has already put first.
    if (held && (held.working || !working)) continue;

    byEmployee.set(employeeName, {
      logId: row.id,
      employeeName,
      shortName: employeeName.split(' ')[0] ?? employeeName,
      activityName: row.activity_types?.name ?? 'Work',
      fieldId: field.id,
      fieldName: field.name,
      plot: plot.data,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      working,
    });
  }

  return [...byEmployee.values()].sort((a, b) => Number(b.working) - Number(a.working));
}
