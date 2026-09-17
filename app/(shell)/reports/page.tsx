import { PeriodMenu } from '@/components/audit/PeriodMenu';
import { WeeklyColumns } from '@/components/charts/WeeklyColumns';
import { BreakdownTabs } from '@/components/reports/BreakdownTabs';
import { ProductUsageTable } from '@/components/reports/ProductUsageTable';
import { Screen } from '@/components/shell/Screen';
import { Panel } from '@/components/shell/Panel';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { parseAuditQuery, periodBounds, PERIOD_LABELS } from '@/lib/auditQuery';
import { EMPTY_LOG_QUERY, type RawSearchParams } from '@/lib/logQuery';
import { groupHours, productUsage, totalHours, weeklyHours } from '@/lib/reports';
import { findApplicationRecords } from '@/lib/repositories/applications';
import { findLogs } from '@/lib/repositories/logs';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

interface ReportsPageProps {
  readonly searchParams: RawSearchParams;
}

/**
 * Where the labour and the inputs went.
 *
 * Laid out as a report rather than a dashboard: one headline figure with the
 * trend it came from, then the breakdowns, then the detail. A row of equal-sized
 * cards would say that hours, logs, average length and worker count all matter
 * equally, and they do not — every other number here is a way of dividing up the
 * first one.
 *
 * Shares the Audit Manager's period control rather than inventing a second one:
 * they answer adjacent questions about the same window, and a farm comparing
 * "hours on Field B" against "what we sprayed on Field B" should not have to
 * re-pick the dates on the way between them.
 *
 * Every number is derived from the logs at request time by the pure functions in
 * `lib/reports.ts`. Nothing is precomputed, so editing a log's times changes the
 * report on the next render — a reporting table that drifts from the rows it
 * summarises is worse than no report.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const viewer = await currentViewer();
  const query = parseAuditQuery(searchParams);
  const bounds = periodBounds(query.period);

  const [logs, records] = await Promise.all([
    findLogs(viewer.organization.id, {
      ...EMPTY_LOG_QUERY,
      q: '',
      open: [],
      sort: 'date-desc',
      range: 'all',
    }),
    findApplicationRecords(viewer.organization.id, bounds),
  ]);

  // The log query has no arbitrary date bound, so the period is applied here.
  // Filtering in memory is right at this size and keeps one definition of the
  // period rather than two that could disagree at the boundary.
  const inPeriod = bounds.from
    ? logs.filter((log) => log.startedAt >= (bounds.from as string))
    : logs;

  const hours = totalHours(inPeriod);
  const workers = new Set(inPeriod.map((log) => log.employee)).size;
  const fields = new Set(inPeriod.map((log) => log.field)).size;
  const average = inPeriod.length > 0 ? Math.round((hours / inPeriod.length) * 10) / 10 : 0;

  return (
    <Screen
      title="Reports"
      subtitle={`Labour and inputs — ${PERIOD_LABELS[query.period].toLowerCase()}`}
      actions={<PeriodMenu query={query} basePath="/reports" />}
    >
      <PageEntrance index={1}>
        <section className="flex w-full flex-col self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel">
          <div className="flex flex-col gap-[20px] px-[16px] pt-[24px] sm:px-[30px] lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-end gap-[14px]">
              <span className="text-[48px] font-medium leading-[38px] tabular-nums text-black">
                <AnimatedNumber value={hours} from={0} />
                <span className="text-[24px] leading-[38px]">h</span>
              </span>
              <span className="pb-[3px] text-[14px] font-normal leading-[1.4] text-[#4D4D4D]">
                logged across
                <br />
                {inPeriod.length} {inPeriod.length === 1 ? 'log' : 'logs'}
              </span>
            </div>

            {/*
              Secondary figures sit inline rather than in their own cards: each
              one is a slice of the headline, and giving them equal weight would
              say they are independent facts.
            */}
            <dl className="flex flex-wrap items-baseline gap-x-[28px] gap-y-[8px]">
              <Inline label="Average log" value={`${average}h`} />
              <Inline label="Workers" value={String(workers)} />
              <Inline label="Fields" value={String(fields)} />
              <Inline label="Applications" value={String(records.length)} />
            </dl>
          </div>

          <WeeklyColumns weeks={weeklyHours(inPeriod)} />
        </section>
      </PageEntrance>

      <PageEntrance index={2}>
        <BreakdownTabs
          byActivity={groupHours(inPeriod, (log) => log.activity)}
          byField={groupHours(inPeriod, (log) => log.field)}
          byWorker={groupHours(inPeriod, (log) => log.employee)}
        />
      </PageEntrance>

      <PageEntrance index={3}>
        <Panel title={`Product usage (${records.length} applications)`} icon="files">
          <ProductUsageTable usage={productUsage(records)} />
        </Panel>
      </PageEntrance>
    </Screen>
  );
}

interface InlineProps {
  readonly label: string;
  readonly value: string;
}

function Inline({ label, value }: InlineProps) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
        {label}
      </dt>
      <dd className="text-[20px] font-medium leading-[1.2] tabular-nums text-black">{value}</dd>
    </div>
  );
}
