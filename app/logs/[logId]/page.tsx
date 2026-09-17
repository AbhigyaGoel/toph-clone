import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { parseLogQuery, toSearchString, toggleOpenLog, type RawSearchParams } from '@/lib/logQuery';

export const dynamic = 'force-dynamic';

const logIdSchema = z.string().uuid();

interface ExpandedLogPageProps {
  readonly params: { readonly logId: string };
  readonly searchParams: RawSearchParams;
}

/**
 * The old per-log route, kept as a redirect.
 *
 * Expanding a row used to navigate here, which swapped one page component for
 * another and remounted the entire client tree on every View click. It is now a
 * search param on the dashboard itself. This route stays so that links already
 * shared — and the browser history of anyone mid-session — still land on the
 * right view: it forwards to the dashboard with that row open and whatever
 * filters the link carried intact.
 *
 * A malformed id is still a 404. A well-formed id for a log that does not exist
 * is not: the dashboard simply opens nothing, which is the same answer it gives
 * when a filter hides the row.
 */
export default function ExpandedLogPage({ params, searchParams }: ExpandedLogPageProps) {
  const logId = logIdSchema.safeParse(params.logId);
  if (!logId.success) {
    notFound();
  }

  const query = parseLogQuery(searchParams);
  const opened = query.open.includes(logId.data) ? query : toggleOpenLog(query, logId.data);

  redirect(`/${toSearchString(opened)}`);
}
