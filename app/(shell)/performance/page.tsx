import { PeriodMenu } from '@/components/audit/PeriodMenu';
import { PerformanceScreen } from '@/components/performance/PerformanceScreen';
import { Screen } from '@/components/shell/Screen';
import { parseAuditQuery, periodBounds, PERIOD_LABELS } from '@/lib/auditQuery';
import { EMPTY_LOG_QUERY, type RawSearchParams } from '@/lib/logQuery';
import { findEmployeeOverviews } from '@/lib/repositories/employees';
import { findLogs } from '@/lib/repositories/logs';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

interface PerformancePageProps {
  readonly searchParams: RawSearchParams;
}

/**
 * How well the crew — and the transcription behind them — is doing.
 *
 * Deliberately not a second Employees screen. That one is a roster you act on:
 * add, rename, deactivate, and it is laid out as people. This one is a
 * measurement, and it is laid out as a ranking, because the only question worth
 * asking of a measurement across eleven people is who is at the ends of it.
 *
 * The measurement worth making is not just "who logged the most hours" — it is
 * how reliably the voice pipeline turned what they said into a usable record.
 * That is the number the dashboard's "Response Accuracy" card averages away.
 */
export default async function PerformancePage({ searchParams }: PerformancePageProps) {
  const viewer = await currentViewer();
  const query = parseAuditQuery(searchParams);
  const bounds = periodBounds(query.period);

  const [crew, logs] = await Promise.all([
    findEmployeeOverviews(viewer.organization.id),
    findLogs(viewer.organization.id, {
      ...EMPTY_LOG_QUERY,
      q: '',
      open: [],
      sort: 'date-desc',
      range: 'all',
    }),
  ]);

  const inPeriod = bounds.from
    ? logs.filter((log) => log.startedAt >= (bounds.from as string))
    : logs;

  return (
    <Screen
      title="Performance"
      subtitle="Crew output, and how well the voice pipeline is working for each of them"
      actions={<PeriodMenu query={query} basePath="/performance" />}
    >
      <PerformanceScreen
        crew={crew}
        logs={inPeriod}
        periodLabel={PERIOD_LABELS[query.period]}
      />
    </Screen>
  );
}
