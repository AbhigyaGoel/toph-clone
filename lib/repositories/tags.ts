import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { Tag } from '@/lib/types';

const tagSchema = z.object({ id: z.string().uuid(), name: z.string() });

/** Rows of `log_tags` come back with the joined tag nested under `tags`. */
const logLinkSchema = z.object({ log_id: z.string().uuid(), tags: tagSchema });

/** Every tag the organisation has, for the Add Tag picker and the Filter menu. */
export async function findTags(orgId: string): Promise<readonly Tag[]> {
  const { data, error } = await getSupabase()
    .from('tags')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  if (error) {
    throw new RepositoryError('findTags', error.message);
  }

  return z.array(tagSchema).parse(data);
}

/**
 * The tags attached to each of several logs, keyed by log id.
 *
 * One query for the whole set rather than one per log: the dashboard can have
 * several rows expanded at once, and fanning that out would make the number of
 * round trips a function of how many panels happen to be open. Logs with no tags
 * are absent from the map, so callers default to an empty list.
 *
 * Scoped to the organisation through the joined `tags` row, not left to the
 * caller. Its one call site already filters the log ids by org, so today this
 * changes nothing — but "safe because of who calls it" is not a property an
 * exported function keeps, and the next caller to pass ids from somewhere else
 * is how another farm's labels end up on this page.
 */
export async function findTagsForLogs(
  orgId: string,
  logIds: readonly string[]
): Promise<ReadonlyMap<string, readonly Tag[]>> {
  if (logIds.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('log_tags')
    .select('log_id, tags!inner ( id, name )')
    .eq('tags.org_id', orgId)
    .in('log_id', [...logIds]);

  if (error) {
    throw new RepositoryError('findTagsForLogs', error.message);
  }

  const byLog = new Map<string, Tag[]>();
  for (const row of z.array(logLinkSchema).parse(data ?? [])) {
    const current = byLog.get(row.log_id);
    if (current) current.push(row.tags);
    else byLog.set(row.log_id, [row.tags]);
  }

  return byLog;
}

/**
 * The ids of logs carrying any of the named tags.
 *
 * Tag filtering cannot ride on `activity_log_rows` — a log has many tags, so
 * joining them into the row view would multiply rows. Resolving names to log
 * ids first keeps the list query one flat select against the view.
 */
export async function findLogIdsWithTags(
  orgId: string,
  names: readonly string[]
): Promise<readonly string[]> {
  if (names.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('log_tags')
    .select('log_id, tags!inner ( name, org_id )')
    .eq('tags.org_id', orgId)
    .in('tags.name', [...names]);

  if (error) {
    throw new RepositoryError('findLogIdsWithTags', error.message);
  }

  const ids = z
    .array(z.object({ log_id: z.string().uuid() }))
    .parse(data ?? [])
    .map((row) => row.log_id);

  return [...new Set(ids)];
}
