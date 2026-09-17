import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';

interface ReplayLinkProps {
  /** `solid` for the Map, where it is the screen's own next step. */
  readonly tone?: 'solid' | 'quiet';
}

/**
 * The way into the replay, from the two screens it follows on from.
 *
 * On the Map, because the replay is that map with time added. On the Dashboard,
 * because "what happened yesterday" is the first question of the morning and a
 * table answers it one row at a time.
 *
 * A link rather than a nav item: the rail already lists nine destinations, and
 * the replay is a thing you do *to* a day rather than a place the farm's data
 * lives.
 */
export function ReplayLink({ tone = 'quiet' }: ReplayLinkProps) {
  const solid = tone === 'solid';

  return (
    <Link
      href="/replay"
      className={`flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] px-[14px] py-[8px] text-[14px] font-normal leading-[1.3] shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/30 ${
        solid ? 'bg-black text-white' : 'bg-white text-[#4D4D4D]'
      }`}
    >
      <Icon name="play" size={12} />
      Replay a day
    </Link>
  );
}
