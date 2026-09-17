import { InboxScreen } from '@/components/inbox/InboxScreen';
import { loadInbox } from '@/lib/loadInbox';
import type { RawSearchParams } from '@/lib/logQuery';
import { can } from '@/lib/permissions';
import { currentViewer } from '@/lib/viewer';

/** What is waiting changes as logs arrive and intervals elapse. */
export const dynamic = 'force-dynamic';

interface InboxPageProps {
  readonly searchParams: RawSearchParams;
}

/** Which rows are open, from `?open=` — repeated once per open row. */
function openIds(params: RawSearchParams): readonly string[] {
  const raw = params.open;
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw;
  return [];
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const [data, viewer] = await Promise.all([
    loadInbox(openIds(searchParams)),
    currentViewer(),
  ]);

  return (
    <InboxScreen
      items={data.items}
      details={data.details}
      products={data.products}
      reference={data.reference}
      canReview={viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'logs:review')}
      canWrite={viewer.canWrite}
      canRetract={
        viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'logs:delete')
      }
    />
  );
}
