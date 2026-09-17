import { cache } from 'react';
import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { DashboardStats } from '@/lib/types';

/**
 * `dashboard_stats` is a view, so every card is computed from the rows on each
 * request: today's recordings by `recorded_at`, the new count by log status,
 * active workers from the employees table, and accuracy as the mean
 * transcription confidence. Postgres returns `numeric` as a string, hence the
 * coercion.
 */
const statsSchema = z.object({
  todays_recordings: z.coerce.number().int().nonnegative(),
  new_logs: z.coerce.number().int().nonnegative(),
  active_workers: z.coerce.number().int().nonnegative(),
  response_accuracy: z.coerce.number().min(0).max(100).nullable(),
});

export const findDashboardStats = cache(async (orgId: string): Promise<DashboardStats> => {
  const { data, error } = await getSupabase()
    .from('dashboard_stats')
    .select('todays_recordings, new_logs, active_workers, response_accuracy')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    throw new RepositoryError('findDashboardStats', error.message);
  }
  if (!data) {
    throw new RepositoryError('findDashboardStats', `no stats row for organisation ${orgId}`);
  }

  const stats = statsSchema.parse(data);

  return {
    todaysRecordings: stats.todays_recordings,
    newLogs: stats.new_logs,
    activeWorkers: stats.active_workers,
    // No recordings yet means there is nothing to be accurate about.
    responseAccuracy: stats.response_accuracy ?? 0,
  };
});
