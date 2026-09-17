import { StatCard } from '@/components/dashboard/StatCard';
import type { DashboardStats, StatCard as StatCardModel } from '@/lib/types';

interface StatCardRowProps {
  readonly stats: DashboardStats;
}

/** The three summary cards, in design order, from the derived stats. */
const toCards = (stats: DashboardStats): readonly StatCardModel[] => [
  {
    id: 'todays-recordings',
    label: 'Todays Recordings',
    value: stats.todaysRecordings,
    note: stats.newLogs > 0 ? `${stats.newLogs} New` : undefined,
    icon: 'calendar',
  },
  {
    id: 'active-workers',
    label: 'Active Workers',
    value: stats.activeWorkers,
    icon: 'clipboard-pen',
  },
  {
    id: 'response-accuracy',
    label: 'Response Accuracy',
    value: stats.responseAccuracy,
    icon: 'percent',
  },
];

/**
 * Figma `Frame 176` — the three equal-width summary cards.
 *
 * A grid rather than a flex row so the cards keep equal widths at any size and
 * stack once three abreast would squeeze their labels.
 */
export function StatCardRow({ stats }: StatCardRowProps) {
  return (
    <div className="grid grid-cols-1 gap-[10px] self-stretch md:grid-cols-3">
      {toCards(stats).map((card, index) => (
        <StatCard key={card.id} card={card} index={index} />
      ))}
    </div>
  );
}
