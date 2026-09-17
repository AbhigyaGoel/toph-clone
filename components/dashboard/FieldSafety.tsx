'use client';

import { motion } from 'framer-motion';

import { Icon } from '@/components/ui/Icon';
import { EXPIRING_SOON_HOURS } from '@/lib/inbox';
import { EASE_QUICK } from '@/lib/motion';
import type { RestrictedField } from '@/lib/types';

interface FieldSafetyProps {
  readonly fieldName: string;
  /** The governing restriction on this field, or null when it is clear. */
  readonly restriction: RestrictedField | null;
}

/**
 * Whether anyone can walk into this field right now.
 *
 * The most operationally important sentence this product can say. A
 * restricted-entry interval is where compliance errors most often happen: a
 * grower checks the pre-harvest interval before sending a crew to pick and
 * forgets that yesterday's spray still has hours left to run. The person who
 * pays for that mistake is the worker who gets sent in.
 *
 * Three states rather than two, because "clear in twenty minutes" and "clear in
 * twenty hours" call for different decisions — one means wait, the other means
 * reschedule the crew.
 *
 * Shown on the log's own map, where somebody looking at what happened on a
 * field is already looking at the field.
 */
export function FieldSafety({ fieldName, restriction }: FieldSafetyProps) {
  if (!restriction) {
    return (
      <Band tint="#146C44" ground="rgba(20,108,68,0.08)" icon="check">
        <strong className="font-medium">{fieldName} is clear.</strong> No re-entry interval is
        running on this block.
      </Band>
    );
  }

  const clearsAt = new Date(restriction.clearsAt);
  const hoursLeft = (clearsAt.getTime() - Date.now()) / 3_600_000;
  const soon = hoursLeft <= EXPIRING_SOON_HOURS;
  const time = clearsAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const day = clearsAt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Band
      tint={soon ? '#7A5B00' : '#B00020'}
      ground={soon ? 'rgba(122,91,0,0.1)' : 'rgba(176,0,32,0.08)'}
      icon="x"
    >
      <strong className="font-medium">
        {fieldName} is under restricted entry until {time}
      </strong>{' '}
      on {day} — {describe(hoursLeft)} after {restriction.productName}. Nobody should be sent in
      before then.
    </Band>
  );
}

interface BandProps {
  readonly tint: string;
  readonly ground: string;
  readonly icon: 'check' | 'x';
  readonly children: React.ReactNode;
}

function Band({ tint, ground, icon, children }: BandProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={EASE_QUICK}
      className="flex items-start gap-[10px] self-stretch rounded-[10px] px-[14px] py-[10px]"
      style={{ backgroundColor: ground }}
    >
      <span
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: ground, color: tint }}
      >
        <Icon name={icon} size={10} />
      </span>
      <span className="text-[12px] font-normal leading-[1.45]" style={{ color: tint }}>
        {children}
      </span>
    </motion.div>
  );
}

/** "3 hours", "40 minutes" — whichever a person would actually say. */
function describe(hours: number): string {
  if (hours <= 0) return 'clearing now';
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
  }
  const rounded = Math.round(hours);
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'} left`;
}
