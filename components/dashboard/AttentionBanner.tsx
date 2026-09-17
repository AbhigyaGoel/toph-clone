'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';
import type { AttentionSummary } from '@/lib/inbox';

interface AttentionBannerProps {
  readonly summary: AttentionSummary;
}

/**
 * One line about the inbox, not a second copy of it.
 *
 * This was a five-row queue listing the worst exceptions — which is exactly what
 * the Inbox lists, so the two screens showed the same rows and each row on the
 * dashboard navigated into the dashboard's own table, scrolled a thousand pixels
 * down to find itself. Two surfaces doing one job, and the more prominent one
 * doing it worse.
 *
 * What the dashboard actually owes a manager at 7am is the *answer*: is anything
 * wrong, and how bad. That is one sentence. The work of fixing it belongs on the
 * screen built for clearing a list, and this is the door to it.
 *
 * It stays visible when the count is zero, because "nothing is wrong" is the
 * answer they came for, and a banner that disappears when everything is fine
 * makes them wonder whether it ran.
 */
export function AttentionBanner({ summary }: AttentionBannerProps) {
  const clear = summary.total === 0;

  const parts = [
    summary.safety > 0 ? `${summary.safety} safety` : null,
    summary.compliance > 0
      ? `${summary.compliance} compliance ${summary.compliance === 1 ? 'gap' : 'gaps'}`
      : null,
    summary.anomaly > 0 ? `${summary.anomaly} unusual ${summary.anomaly === 1 ? 'rate' : 'rates'}` : null,
  ].filter(Boolean);

  return (
    <motion.div
      layout
      transition={SPRING_SOFT}
      className="flex w-full flex-col items-start gap-[10px] self-stretch rounded-[20px] bg-white px-[16px] py-[14px] shadow-panel sm:flex-row sm:items-center sm:gap-[14px] sm:px-[30px]"
    >
      <span
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: clear
            ? 'rgba(20,108,68,0.1)'
            : summary.safety > 0
              ? 'rgba(176,0,32,0.08)'
              : 'rgba(122,91,0,0.1)',
          color: clear ? '#146C44' : summary.safety > 0 ? '#B00020' : '#7A5B00',
        }}
      >
        <Icon name={clear ? 'check' : 'inbox'} size={13} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-normal leading-[1.3] text-black">
          {clear
            ? 'Nothing needs attention'
            : `${summary.total} ${summary.total === 1 ? 'thing needs' : 'things need'} attention`}
        </span>
        <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
          {clear
            ? 'No restricted fields, no compliance gaps, every log read.'
            : parts.length > 0
              ? `${parts.join(', ')} — worst first in the inbox.`
              : 'Logs waiting to be read.'}
        </span>
      </span>

      {clear ? null : (
        <Link
          href="/inbox"
          className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[8px] text-[14px] font-normal leading-[1.3] text-white outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >
          Open inbox
          <Icon name="expand" size={11} />
        </Link>
      )}
    </motion.div>
  );
}
