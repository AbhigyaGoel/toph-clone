import { MapScreen } from '@/components/map/MapScreen';
import { Screen } from '@/components/shell/Screen';
import { EMPTY_LOG_QUERY, type RawSearchParams } from '@/lib/logQuery';
import { findApplicationRecords } from '@/lib/repositories/applications';
import { findFieldOverviews, findFieldWorkers } from '@/lib/repositories/fields';
import { findLogs } from '@/lib/repositories/logs';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface MapPageProps {
  readonly searchParams: RawSearchParams;
}

/**
 * Where the work happened, for the whole farm at once.
 *
 * The satellite tile and the plot coordinates already existed for the expanded
 * log's map; this screen is the same data asked a different question. It is also
 * where the compliance model earns its keep outside the Audit Manager: a field
 * under a restricted-entry interval is drawn in the danger colour, because the
 * person who needs that fact is looking at a map of the farm, not at a register
 * of records.
 */
export default async function MapPage({ searchParams }: MapPageProps) {
  const viewer = await currentViewer();

  const raw = typeof searchParams.field === 'string' ? searchParams.field.toLowerCase() : '';
  const selectedId = UUID.test(raw) ? raw : null;

  const [fields, records, logs, workers] = await Promise.all([
    findFieldOverviews(viewer.organization.id),
    findApplicationRecords(viewer.organization.id),
    findLogs(viewer.organization.id, { ...EMPTY_LOG_QUERY, q: '', open: [], sort: 'date-desc' }),
    findFieldWorkers(viewer.organization.id),
  ]);

  return (
    <Screen title="Map" subtitle="Every block, and what has happened on it">
      <MapScreen
        fields={fields}
        records={records}
        logs={logs}
        workers={workers}
        selectedId={selectedId}
      />
    </Screen>
  );
}
