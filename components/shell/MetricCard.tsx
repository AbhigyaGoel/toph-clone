'use client';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Icon, type IconName } from '@/components/ui/Icon';

interface MetricCardProps {
  readonly label: string;
  readonly icon: IconName;
  /** Numbers roll; anything else is rendered as given. */
  readonly value: number | string;
  /** Muted qualifier beside the number, e.g. "3 unreviewed". */
  readonly note?: string;
  /** Appends a unit to a numeric value without breaking the roll. */
  readonly suffix?: string;
  /** Draws attention when the number is a problem rather than a fact. */
  readonly tone?: 'neutral' | 'warning';
}

/**
 * The dashboard's stat card, one step down the hierarchy.
 *
 * Same frame, shadow, radius and icon+label row as the design's `Frame 120`;
 * the metric is 32px rather than 48px. These appear on the screens the Figma
 * does not draw, where four or five numbers share a row and the 48px type would
 * make a summary strip look like the main event.
 *
 * No hover treatment, for the same reason the design's card has none: movement
 * under the pointer promises a click these do not honour.
 */
export function MetricCard({
  label,
  icon,
  value,
  note,
  suffix,
  tone = 'neutral',
}: MetricCardProps) {
  const ink = tone === 'warning' ? 'text-[#B00020]' : 'text-black';

  return (
    <article className="flex flex-1 flex-col items-start gap-[14px] rounded-[14px] p-[20px] shadow-card">
      <div className="flex items-center justify-center gap-[8px]">
        <Icon name={icon} className={tone === 'warning' ? 'text-[#B00020]' : 'text-black'} />
        <h3 className="whitespace-nowrap text-[14px] font-normal leading-[1.3] text-black">
          {label}
        </h3>
      </div>

      <div className="flex items-end gap-[10px]">
        <span className={`text-[32px] font-medium leading-[24px] tabular-nums ${ink}`}>
          {typeof value === 'number' ? <AnimatedNumber value={value} from={0} /> : value}
          {suffix}
        </span>
        {note ? (
          <span className="whitespace-nowrap text-[12px] font-normal leading-[1.3] text-black opacity-50">
            {note}
          </span>
        ) : null}
      </div>
    </article>
  );
}
