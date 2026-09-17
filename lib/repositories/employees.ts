import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { EmployeeOverview } from '@/lib/types';

const overviewSchema = z.object({
  employee_id: z.string().uuid(),
  full_name: z.string(),
  is_active: z.boolean(),
  log_count: z.coerce.number().int().nonnegative(),
  unreviewed_count: z.coerce.number().int().nonnegative(),
  worked_seconds: z.coerce.number().nonnegative(),
  last_logged_at: z.string().nullable(),
  field_count: z.coerce.number().int().nonnegative(),
  recording_count: z.coerce.number().int().nonnegative(),
  // Null for a worker with no recordings — which is not the same as 0% accurate.
  mean_confidence: z.coerce.number().min(0).max(1).nullable(),
});

/**
 * The roster, with each worker's record.
 *
 * Ordered by activity rather than alphabetically: the roster is read to answer
 * "who is doing the work" far more often than "where is Ava in the list", and
 * the name is searchable either way.
 */
export async function findEmployeeOverviews(
  orgId: string
): Promise<readonly EmployeeOverview[]> {
  const { data, error } = await getSupabase()
    .from('employee_activity')
    .select(
      'employee_id, full_name, is_active, log_count, unreviewed_count, worked_seconds, last_logged_at, field_count, recording_count, mean_confidence'
    )
    .eq('org_id', orgId)
    .order('log_count', { ascending: false })
    .order('full_name');

  if (error) {
    throw new RepositoryError('findEmployeeOverviews', error.message);
  }

  return z
    .array(overviewSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.employee_id,
      name: row.full_name,
      isActive: row.is_active,
      logCount: row.log_count,
      unreviewedCount: row.unreviewed_count,
      // Rounded once, here, so every screen shows the same number.
      hours: Math.round((row.worked_seconds / 3600) * 10) / 10,
      lastLoggedAt: row.last_logged_at,
      fieldCount: row.field_count,
      recordingCount: row.recording_count,
      meanConfidence: row.mean_confidence,
    }));
}
