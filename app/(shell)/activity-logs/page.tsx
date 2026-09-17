import { redirect } from 'next/navigation';

import { LogQueryProvider } from '@/components/dashboard/LogQueryProvider';
import { SearchField } from '@/components/dashboard/SearchField';
import { ActivityLogsScreen } from '@/components/logs/ActivityLogsScreen';
import { Screen } from '@/components/shell/Screen';
import { parseLogQuery, toSearchString, type RawSearchParams, type StatedKey } from '@/lib/logQuery';

/**
 * This screen states its range and sort in the URL even when they match the
 * model's defaults, because its own defaults differ — see `StatedKey`.
 */
const ARCHIVE_STATED: readonly StatedKey[] = ['range', 'sort'];
import { can } from '@/lib/permissions';
import { findLogCompliance, findProducts } from '@/lib/repositories/applications';
import { findFilterOptions } from '@/lib/repositories/filterOptions';
import { findLogDetails, findLogs } from '@/lib/repositories/logs';
import { findReferenceData } from '@/lib/repositories/reference';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

interface ActivityLogsPageProps {
  readonly searchParams: RawSearchParams;
}

/**
 * Every log the farm has, as opposed to the dashboard's review queue.
 *
 * This screen opens on all time, newest first, where the dashboard opens on
 * this month. The dashboard's job is "what needs my attention now", so a month
 * is the right frame; this screen's job is "find the log where we sprayed Field
 * K", and an archive that hides everything older than four weeks is not an
 * archive.
 *
 * Those defaults are applied by *redirecting* to the URL that states them
 * rather than by quietly parsing them in. Two screens reading the same params
 * with different defaults would mean the toolbar's chips and the rows they
 * claim to describe could disagree — and the link you copied would open
 * something else for whoever you sent it to.
 */
export default async function ActivityLogsPage({ searchParams }: ActivityLogsPageProps) {
  const query = parseLogQuery(searchParams);
  const statedRange = typeof searchParams.range === 'string';
  const statedSort = typeof searchParams.sort === 'string';

  if (!statedRange || !statedSort) {
    redirect(
      `/activity-logs${toSearchString(
        {
          ...query,
          range: statedRange ? query.range : 'all',
          sort: statedSort ? query.sort : 'date-desc',
        },
        ARCHIVE_STATED
      )}`
    );
  }

  const viewer = await currentViewer();

  const [logs, filterOptions, details, products, reference] = await Promise.all([
    findLogs(viewer.organization.id, query),
    findFilterOptions(viewer.organization.id),
    findLogDetails(viewer.organization.id, query.open),
    findProducts(viewer.organization.id),
    findReferenceData(viewer.organization.id),
  ]);

  const compliance = await findLogCompliance(
    viewer.organization.id,
    logs.map((log) => log.id)
  );

  return (
    <LogQueryProvider always={ARCHIVE_STATED}>
      <Screen
        title="Activity Logs"
        subtitle="Every log your crew has recorded"
        actions={<SearchField />}
      >
        <ActivityLogsScreen
          logs={logs}
          records={Object.fromEntries(compliance)}
          filterOptions={filterOptions}
          details={details}
          products={products}
          reference={reference}
          canWrite={viewer.canWrite}
          canRetract={
            viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'logs:delete')
          }
        />
      </Screen>
    </LogQueryProvider>
  );
}
