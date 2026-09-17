import { LogQueryProvider } from '@/components/dashboard/LogQueryProvider';
import { AttentionBanner } from '@/components/dashboard/AttentionBanner';
import { LogsPanel } from '@/components/dashboard/LogsPanel';
import { ReportButton } from '@/components/dashboard/ReportButton';
import { ReplayLink } from '@/components/replay/ReplayLink';
import { ScrollToOpenLog } from '@/components/dashboard/ScrollToOpenLog';
import { SearchField } from '@/components/dashboard/SearchField';
import { StatCardRow } from '@/components/dashboard/StatCardRow';
import { Screen } from '@/components/shell/Screen';
import { PageEntrance } from '@/components/ui/PageEntrance';
import type { AttentionSummary } from '@/lib/inbox';
import type { LogQuery } from '@/lib/logQuery';
import type {
  ActivityLog,
  DashboardStats,
  FilterOptions,
  LogDetail,
  LogInput,
  Product,
  ReferenceData,
  Viewer,
} from '@/lib/types';

interface DashboardScreenProps {
  readonly viewer: Viewer;
  readonly stats: DashboardStats;
  readonly filterOptions: FilterOptions;
  readonly reference: ReferenceData;
  /** The product register, so a compliance record can be filed from a row. */
  readonly products: readonly Product[];
  readonly canRetract: boolean;
  readonly query: LogQuery;
  readonly logs: readonly ActivityLog[];
  /** Panels for the rows the query has open. */
  readonly details: readonly LogDetail[];
  /** The same logs in the edit form's shape, keyed by log id. */
  readonly editables: Readonly<Record<string, LogInput>>;
  /** The morning triage list. */
  readonly attention: AttentionSummary;
  /** Logs with something wrong, so the table can mark those rows. */
  readonly flaggedLogIds: readonly string[];
  /** The current query string, so opening from the queue keeps the filters. */
  readonly search: string;
}

/**
 * Figma `Dashboard` frame — the stat cards and the log panel, inside the shell.
 *
 * The design is drawn at 1676 x 955 and that geometry lives in the shell layout,
 * every screen shares. What is specific to this one is the three cards and the
 * "New Employee Logs" panel beneath them.
 *
 * `LogQueryProvider` wraps the shell rather than sitting inside it because the
 * search field is in the header band and the table is in the body, and both
 * read the same optimistic query. Passing the shell through as children keeps
 * it a server component despite the client provider above it.
 */
export function DashboardScreen({
  viewer,
  stats,
  filterOptions,
  reference,
  products,
  canRetract,
  query,
  logs,
  details,
  editables,
  attention,
  flaggedLogIds,
  search,
}: DashboardScreenProps) {
  const expanded = query.open.length > 0;

  return (
    <LogQueryProvider>
      <ScrollToOpenLog logId={query.open[0] ?? null} />
      <Screen
        title="Dashboard"
        subtitle="An overview of your farm and employee activity"
        actions={
          <>
            <ReplayLink />
            <ReportButton />
            <SearchField />
          </>
        }
      >
        <PageEntrance index={1}>
          <StatCardRow stats={stats} />
        </PageEntrance>

        {/*
          Between the numbers and the table, which is the order the manager
          reads in: how did yesterday go, what needs me, then the detail. Above
          the table because the table is what it saves them from having to read.
        */}
        <PageEntrance index={2}>
          <AttentionBanner summary={attention} />
        </PageEntrance>

        <PageEntrance index={3} fill={expanded}>
          <LogsPanel
            title={`New Employee Logs (${logs.length})`}
            filterOptions={filterOptions}
            logs={logs}
            details={details}
            expanded={expanded}
            canWrite={viewer.canWrite}
            writeBlockedReason={viewer.writeBlockedReason}
            reference={reference}
            products={products}
            canRetract={canRetract}
            editables={editables}
            flaggedLogIds={flaggedLogIds}
          />
        </PageEntrance>
      </Screen>
    </LogQueryProvider>
  );
}
