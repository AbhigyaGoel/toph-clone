import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';

interface ReplayLinkProps {
  /** `solid` for the Map, where it is the screen's own next step. */
  readonly tone?: 'solid' | 'quiet';
}

/**
 * The contextual way in, from the archive.
 *
 * The replay has its own rail item — that is how you reach it from anywhere,
 * including the home page. This is the second entry point, and it sits on
 * Activity Logs because that is the screen where you are already looking at a
 * list of what happened and the obvious next thought is "show me that as a
 * day".
 *
 * It used to sit on the Map instead, which was the wrong shelf: the Map is the
 * farm's *present* state — what is closed right now, what was worked recently —
 * and nobody opens a live view to watch yesterday.
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
