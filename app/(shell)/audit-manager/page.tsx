import { PeriodMenu } from '@/components/audit/PeriodMenu';
import { AuditScreen } from '@/components/audit/AuditScreen';
import { Screen } from '@/components/shell/Screen';
import { parseAuditQuery, periodBounds } from '@/lib/auditQuery';
import { can } from '@/lib/permissions';
import type { RawSearchParams } from '@/lib/logQuery';
import {
  findApplicationRecords,
  findMissingRecords,
  findProducts,
} from '@/lib/repositories/applications';
import { recentEvents } from '@/lib/repositories/audit';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

interface AuditPageProps {
  readonly searchParams: RawSearchParams;
}

/**
 * The compliance half of the product.
 *
 * Toph's own material describes the job as turning field activity into
 * audit-ready evidence for certifications and inspections, and this is the
 * screen where that claim has to hold up: what went on which field, at what
 * rate, by whom, under what conditions, and when the field became safe again.
 *
 * It reads from `application_records`, the view that derives the two intervals,
 * and grades each row against the rules in `lib/compliance.ts` — so what counts
 * as "audit ready" is one readable file rather than a condition spread across a
 * query, a component and a CSV writer.
 */
export default async function AuditManagerPage({ searchParams }: AuditPageProps) {
  const viewer = await currentViewer();
  const query = parseAuditQuery(searchParams);
  const bounds = periodBounds(query.period);

  const [records, missing, products, events] = await Promise.all([
    findApplicationRecords(viewer.organization.id, {
      ...bounds,
      kind: query.kind ?? undefined,
      fieldId: query.fieldId ?? undefined,
    }),
    findMissingRecords(viewer.organization.id, bounds),
    findProducts(viewer.organization.id),
    recentEvents(viewer.organization.id, 100),
  ]);

  return (
    <Screen
      title="Audit Manager"
      subtitle="Application records, and the gaps an inspection would find"
      actions={<PeriodMenu query={query} basePath="/audit-manager" />}
    >
      <AuditScreen
        query={query}
        records={records}
        missing={missing}
        products={products}
        canWrite={viewer.canWrite}
        writeBlockedReason={viewer.writeBlockedReason}
        canRetract={
          viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'logs:delete')
        }
        events={events}
      />
    </Screen>
  );
}
