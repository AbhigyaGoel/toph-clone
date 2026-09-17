import 'server-only';

import { logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/server';
import type { SearchHit, SearchKind } from '@/lib/types';

/** What the palette shows at once. More than this is a list, not a shortcut. */
export const SEARCH_LIMIT = 16;

/** Below two characters the ranking is meaningless, so the query is not run. */
export const MIN_QUERY = 2;

const KINDS: readonly SearchKind[] = ['log', 'worker', 'field', 'product', 'tag', 'activity'];

const isKind = (value: string): value is SearchKind => KINDS.includes(value as SearchKind);

/**
 * Everything matching `query`, ranked, in one round trip.
 *
 * Returns nothing rather than everything for a query that is too short. An
 * empty palette says "keep typing"; a palette showing all twelve workers
 * because you typed "a" says the search is broken.
 */
export async function searchEverything(
  orgId: string,
  query: string,
  limit = SEARCH_LIMIT
): Promise<readonly SearchHit[]> {
  const needle = query.trim();
  if (needle.length < MIN_QUERY) return [];

  const { data, error } = await getSupabase().rpc('search_everything', {
    target_org: orgId,
    needle,
    max_results: limit,
  });

  if (error) {
    logger.error('searchEverything', error.message);
    return [];
  }

  // The function's `kind` is text on the wire. Narrowing here rather than
  // casting means a kind added in SQL and forgotten in TypeScript is dropped
  // quietly instead of rendering as an unhandled icon.
  return (data ?? []).flatMap((row) =>
    isKind(row.kind)
      ? [{ kind: row.kind, id: row.id, label: row.label, sublabel: row.sublabel }]
      : []
  );
}
