import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk } from '@/lib/apiResponse';
import { searchEverything, MIN_QUERY, SEARCH_LIMIT } from '@/lib/repositories/search';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * What the command palette calls on every (debounced) keystroke.
 *
 * A route handler rather than a Server Action because the caller is a search
 * box, not a form: it fires on input, cancels its own in-flight request when
 * the query moves on, and never needs to revalidate a page. Server Actions are
 * sequenced through the router and cannot be aborted, which is exactly wrong
 * for a search-as-you-type.
 *
 * Signed in or nothing. The palette reaches every worker's name, every
 * transcript and every product on the register, so it is at least as sensitive
 * as the pages it navigates to.
 */
const querySchema = z.object({
  // A long needle is not a search, it is a paste. The cap is what keeps a
  // pathological `ilike '%…50kB…%'` off the database.
  q: z.string().trim().min(MIN_QUERY).max(120),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT).optional(),
});

export async function GET(request: NextRequest) {
  const viewer = await currentViewer();
  if (!viewer.member) {
    return apiError('unauthorised', 'Sign in to search.');
  }


  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });

  // A too-short query is not an error the user should see — it is the normal
  // state of a search box with one character in it. Empty results say the same
  // thing without a red banner.
  if (!parsed.success) {
    return apiOk({ hits: [] });
  }

  const hits = await searchEverything(viewer.organization.id, parsed.data.q, parsed.data.limit);

  return apiOk({ hits });
}
