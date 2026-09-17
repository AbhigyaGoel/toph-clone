'use client';

import { motion } from 'framer-motion';

import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';

interface ExportButtonProps {
  /** The current query as a search string, so the file matches the screen. */
  readonly search: string;
  readonly count: number;
  /** Which export endpoint to hit. */
  readonly kind?: 'logs' | 'records';
}

/**
 * Downloads what is currently on screen.
 *
 * An anchor rather than a button with a click handler: the browser's own
 * download machinery handles the file, the URL is visible and copyable, and it
 * keeps working with JavaScript disabled. `download` is deliberately absent —
 * the server sets `content-disposition`, which is the half of this the browser
 * should be trusting.
 */
export function ExportButton({ search, count, kind = 'logs' }: ExportButtonProps) {
  const disabled = count === 0;

  if (disabled) {
    return (
      <span className="flex shrink-0 cursor-not-allowed items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-white px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-[#B3B3B3] shadow-chip">
        <Icon name="files" />
        Export CSV
      </span>
    );
  }

  return (
    <motion.a
      href={`/api/exports/${kind}${search}`}
      whileHover={{ y: -1, scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={SPRING_SOFT}
      className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-white px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/30"
    >
      <Icon name="files" />
      Export CSV
      <span className="tabular-nums opacity-50">({count})</span>
    </motion.a>
  );
}
