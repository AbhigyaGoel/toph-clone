'use client';

import { motion } from 'framer-motion';

import { DESIGN_FRAME } from '@/components/dashboard/MapSurface';

interface LogDetailSkeletonProps {
  /**
   * Whether this log's panel will carry an "Applied" record block.
   *
   * The row knows its activity before the detail arrives, and the activity is
   * what decides whether that block exists — so the skeleton can reserve 83px
   * for a spray and not for a harvest, instead of splitting the difference and
   * being wrong for both.
   */
  readonly expectRecord: boolean;
}

/**
 * What an opening row shows while its detail is still in flight.
 *
 * Its geometry is the point, not its texture. The row opens on the click and the
 * server answers a moment later; if the placeholder is a different height from
 * the content that replaces it, every row beneath visibly jumps a second time.
 * It did: 415px of skeleton giving way to a 718px panel moved the rest of the
 * table 300px, which reads as the page having got the answer wrong the first
 * time.
 *
 * So this mirrors the real panel block for block, in the order the panel builds
 * them, and the map placeholder holds the same aspect ratio as the satellite
 * tile rather than a guessed height. The blocks are measured from a real log
 * rather than estimated, which is why they carry odd numbers — and why adding
 * the Extracted card meant coming back here: the panel grew 160px and the
 * skeleton silently stopped fitting it.
 */
export function LogDetailSkeleton({ expectRecord }: LogDetailSkeletonProps) {
  return (
    <div
      aria-hidden
      className="sticky left-0 flex w-[100cqw] flex-col items-stretch gap-[20px] bg-white p-[20px] sm:p-[40px] xl:flex-row xl:items-center xl:justify-center xl:gap-[40px]"
    >
      <div className="flex w-full flex-col items-center gap-[20px] xl:w-[592px] xl:shrink-0">
        {/* Waveform, its 0:00 / 3:35 labels, and the transport. */}
        <Block className="h-[178px] w-full" />
        {/* Summary heading plus the transcript. */}
        <Block className="h-[91px] w-full" delay={0.04} />
        {/* The five extracted fields and their three checks. */}
        <Block className="h-[235px] w-full" delay={0.08} />
        {/* The "Applied" compliance record — only on work that owes one. */}
        {expectRecord ? <Block className="h-[83px] w-full" delay={0.12} /> : null}
        {/* Add Tag, sized between a bare row and one carrying a tag. */}
        <Block className="h-[64px] w-full" delay={0.16} />
        {/* Edit / Delete. */}
        <Block className="h-[34px] w-full" delay={0.2} />
      </div>

      <div className="flex w-full flex-col gap-[10px] xl:w-[594px] xl:shrink-0">
        <div className="relative w-full overflow-hidden rounded-[14px] bg-black/[0.05]">
          <div style={{ paddingTop: `${(DESIGN_FRAME.height / DESIGN_FRAME.width) * 100}%` }} />
          <motion.div
            initial={{ opacity: 0.35 }}
            animate={{ opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 bg-black/[0.04]"
          />
        </div>
        <Block className="h-[42px] w-full" delay={0.12} />
      </div>
    </div>
  );
}

interface BlockProps {
  readonly className: string;
  readonly delay?: number;
}

function Block({ className, delay = 0 }: BlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0.35 }}
      animate={{ opacity: [0.35, 0.7, 0.35] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay }}
      className={`rounded-[7.04px] bg-black/[0.05] ${className}`}
    />
  );
}
