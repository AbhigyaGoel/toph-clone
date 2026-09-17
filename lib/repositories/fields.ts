import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { FieldOverview } from '@/lib/types';

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
