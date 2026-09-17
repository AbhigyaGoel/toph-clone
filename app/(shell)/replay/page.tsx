import { ReplayScreen } from '@/components/replay/ReplayScreen';
import { can } from '@/lib/permissions';
import { findProducts } from '@/lib/repositories/applications';
import { findLogDetails } from '@/lib/repositories/logs';
import { findReferenceData } from '@/lib/repositories/reference';
import { findBusiestDay, findReplayDay, findReplayDays } from '@/lib/repositories/replay';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

interface ReplayPageProps {
  readonly searchParams: { readonly date?: string | string[] };
}

/** `YYYY-MM-DD` or nothing — a malformed date falls back rather than throwing. */
function requestedDate(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Opens on the day with the most going on rather than on today.
 *
 * A replay of a day with one log in it teaches nobody what the screen is for,
 * and "today" on a farm dashboard is frequently empty at 7am. The date is still
 * in the URL, so a particular day stays linkable.
 */
export default async function ReplayPage({ searchParams }: ReplayPageProps) {
  const viewer = await currentViewer();
  const asked = requestedDate(searchParams.date);
  const date = asked ?? (await findBusiestDay(viewer.organization.id)) ?? todayUtc();

  const [day, days, products, reference] = await Promise.all([
    findReplayDay(viewer.organization.id, date),
    findReplayDays(viewer.organization.id),
    findProducts(viewer.organization.id),
    findReferenceData(viewer.organization.id),
  ]);

  // Every log on the day, so clicking a dot opens without a second round trip.
  const details = await findLogDetails(
    viewer.organization.id,
    day.presences.map((presence) => presence.logId)
  );

  return (
    <ReplayScreen
      day={day}
      days={days.includes(date) ? days : [date, ...days]}
      details={details}
      products={products}
      reference={reference}
      canWrite={viewer.canWrite}
      canRetract={
        viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'logs:delete')
      }
    />
  );
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
