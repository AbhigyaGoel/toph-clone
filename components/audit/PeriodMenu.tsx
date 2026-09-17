'use client';

import { useRouter } from 'next/navigation';

import { ChipMenu } from '@/components/dashboard/ChipMenu';
import { Icon } from '@/components/ui/Icon';
import {
  DEFAULT_AUDIT_QUERY,
  PERIOD_KEYS,
  PERIOD_LABELS,
  toAuditSearch,
  type AuditQuery,
} from '@/lib/auditQuery';

interface PeriodMenuProps {
  readonly query: AuditQuery;
  /** The screen this control belongs to — it scopes that screen, not another. */
  readonly basePath: string;
}

/**
 * The reporting window, as one control rather than four.
 *
 * It was four chips laid out side by side, which spent most of the header on
 * options nobody had chosen and made the current one a matter of spotting which
 * pill was dark. A single chip naming the active period says the answer first
 * and offers the alternatives on demand — the same trade the log toolbar's Sort
 * and Filter chips already make, so this reuses that menu rather than inventing
 * a second kind.
 *
 * `basePath` is not decoration. This used to be hard-coded to the Audit
 * Manager, and the Performance screen reused the component — so changing the
 * period there navigated you to a different screen entirely.
 */
export function PeriodMenu({ query, basePath }: PeriodMenuProps) {
  const router = useRouter();
  const isDefault = query.period === DEFAULT_AUDIT_QUERY.period;

  const go = (next: AuditQuery) =>
    router.replace(`${basePath}${toAuditSearch(next)}`, { scroll: false });

  return (
    <div className="flex items-center gap-[10px]">
      {/*
        "Filter", not "This year".

        Naming the control after its current value made it read as a label
        rather than a control — you see "This year" and take it for a statement
        about the screen, not something you can open. The verb goes on the chip
        and the value follows it once it is no longer the default, so the
        control says what it does and still says where it is set.
      */}
      <ChipMenu
        chip={{
          id: 'period',
          label: isDefault ? 'Filter' : `Filter: ${PERIOD_LABELS[query.period]}`,
          icon: 'funnel',
          selected: !isDefault,
        }}
        closeOnSelect
        sections={[
          {
            id: 'period',
            label: 'PERIOD',
            options: PERIOD_KEYS.map((period) => ({
              id: period,
              label: PERIOD_LABELS[period],
              selected: query.period === period,
              onSelect: () => go({ ...query, period }),
            })),
          },
        ]}
      />

      {/*
        Only once there is something to undo. A reset that is always present is
        a permanent invitation to a state the user is usually already in.
      */}
      {isDefault ? null : (
        <button
          type="button"
          onClick={() => go(DEFAULT_AUDIT_QUERY)}
          className="flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[80px] px-[10px] py-[6px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
        >
          <Icon name="x" size={11} />
          Reset
        </button>
      )}
    </div>
  );
}
