import { DashboardScreen } from '@/components/dashboard/DashboardScreen';
import { loadDashboard } from '@/lib/loadDashboard';
import type { RawSearchParams } from '@/lib/logQuery';
import { can } from '@/lib/permissions';
import { currentViewer } from '@/lib/viewer';

/** Search, filters and open rows all live in the URL, so this renders per request. */
export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  readonly searchParams: RawSearchParams;
}

/**
 * Figma `Dashboard` — both design frames.
 *
 * The design draws this screen twice: once with the table collapsed and once
 * with a row expanded beneath itself. They are the same page. Which rows are
 * open is `?open=`, so the expanded frame is a state of this route rather than a
 * route of its own — that is what lets a row open without the page remounting,
 * and lets more than one be open at a time.
 */
/** The incoming query as a string, so links built from it keep the filters. */
function toSearch(params: RawSearchParams): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out.set(key, value);
    else if (Array.isArray(value) && value[0]) out.set(key, value[0]);
  }
  return out.toString();
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [data, viewer] = await Promise.all([loadDashboard(searchParams), currentViewer()]);

  return (
    <DashboardScreen
      viewer={viewer}
      stats={data.stats}
      filterOptions={data.filterOptions}
      reference={data.reference}
      products={data.products}
      canRetract={
        viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'logs:delete')
      }
      query={data.query}
      logs={data.logs}
      details={data.details}
      editables={data.editables}
      attention={data.attention}
      flaggedLogIds={data.flaggedLogIds}
      search={toSearch(searchParams)}
    />
  );
}
